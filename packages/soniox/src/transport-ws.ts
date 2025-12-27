import type { NormalizedFrame, TranscriptionStream, TranscriptToken, TranscriptUpdate } from '@saraudio/core';
import { AbortedError, AuthenticationError, NetworkError, ProviderError, RateLimitError } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { buildTransportUrl, frameDurationMs } from '@saraudio/utils';
import { resolveApiKey } from './auth';
import type { SonioxResolvedConfig } from './config';
import type {
  SonioxWsErrorResponse,
  SonioxWsFinishedResponse,
  SonioxWsInitConfig,
  SonioxWsStreamResponse,
  SonioxWsToken,
} from './SonioxWsRealtimeModel';

type StreamStatus = TranscriptionStream['status'];
type SonioxRawMessage = SonioxWsStreamResponse & Partial<SonioxWsFinishedResponse> & Partial<SonioxWsErrorResponse>;

export function createWsStream(resolved: SonioxResolvedConfig, logger?: Logger): TranscriptionStream {
  let status: StreamStatus = 'idle';
  const updateHandlers = new Set<(u: TranscriptUpdate) => void>();
  const errorHandlers = new Set<(e: Error) => void>();
  const statusHandlers = new Set<(s: StreamStatus) => void>();

  let ws: WebSocket | null = null;
  let connecting: Promise<void> | null = null;
  let disconnecting: Promise<void> | null = null;
  let closedByClient = false;

  const queue: { frame: NormalizedFrame<'pcm16'>; dur: number }[] = [];
  let queuedMs = 0;

  // logger is parameter
  // Soniox can emit `speaker` as number or string. Our public contract uses numeric speaker ids.
  // Map non-numeric labels to stable numeric ids for the lifetime of this stream.
  const SPEAKER_LABEL_ID_BASE = 100;
  const speakerLabelToId = new Map<string, number>();
  const speakerIdToLabel = new Map<number, string>();

  const normalizeSpeaker = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) return undefined;
      if (/^\d+$/.test(trimmed)) {
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      const existing = speakerLabelToId.get(trimmed);
      if (existing !== undefined) return existing;
      const id = SPEAKER_LABEL_ID_BASE + speakerLabelToId.size;
      speakerLabelToId.set(trimmed, id);
      speakerIdToLabel.set(id, trimmed);
      return id;
    }
    return undefined;
  };

  const setStatus = (next: StreamStatus): void => {
    if (status === next) return;
    status = next;
    statusHandlers.forEach((h) => h(status));
  };

  const isSonioxRawMessage = (value: unknown): value is SonioxRawMessage => {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    if (v.tokens !== undefined && !Array.isArray(v.tokens)) return false;
    return true;
  };

  const isMarker = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    const s = value.trim();
    return s.startsWith('<') && s.endsWith('>');
  };

  const createToken = (t: SonioxWsToken): TranscriptToken | null => {
    const rawText = t.text;
    if (isMarker(rawText)) return null;
    const text = typeof rawText === 'string' ? rawText : '';
    const token: TranscriptToken = { text, isFinal: t.is_final === true };

    if (typeof t.start_ms === 'number' && Number.isFinite(t.start_ms)) token.startMs = Math.max(0, t.start_ms);
    if (typeof t.end_ms === 'number' && Number.isFinite(t.end_ms)) token.endMs = Math.max(0, t.end_ms);
    if (typeof t.confidence === 'number' && Number.isFinite(t.confidence)) token.confidence = t.confidence;

    const speaker = normalizeSpeaker(t.speaker);
    if (speaker !== undefined) token.speaker = speaker;

    const tokenMetadata: Record<string, unknown> = {};
    if (typeof t.language === 'string') tokenMetadata.language = t.language;
    if (typeof t.source_language === 'string') tokenMetadata.sourceLanguage = t.source_language;
    if (typeof t.translation_status === 'string') tokenMetadata.translationStatus = t.translation_status;
    if (Object.keys(tokenMetadata).length > 0) token.metadata = tokenMetadata;

    return token;
  };

  const resetQueue = (): void => {
    queue.length = 0;
    queuedMs = 0;
  };

  const flushQueue = (): void => {
    const socket = ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const buf = item.frame.pcm.buffer.slice(0);
      socket.send(buf);
    }
  };

  const enqueue = (frame: NormalizedFrame<'pcm16'>): void => {
    if (frame.pcm.length === 0) return;
    const dur = frameDurationMs(frame.pcm.length, frame.sampleRate, frame.channels);
    queue.push({ frame, dur });
    queuedMs += dur;
    while (queuedMs > resolved.queueBudgetMs && queue.length > 1) {
      const dropped = queue.shift();
      if (!dropped) break;
      queuedMs = Math.max(0, queuedMs - dropped.dur);
      logger?.warn('soniox send queue dropped oldest frame (backpressure)', { module: 'provider-soniox', queuedMs });
    }
    flushQueue();
  };

  const emitUpdate = (u: TranscriptUpdate): void => {
    updateHandlers.forEach((h) => h(u));
  };

  const emitError = (e: Error): void => errorHandlers.forEach((h) => h(e));

  const mapCloseReason = (code: number, reasonRaw: string): Error | null => {
    // Soniox typically sends JSON with error_code/error_message in reason
    try {
      const parsed: unknown = reasonRaw ? JSON.parse(reasonRaw) : undefined;
      if (typeof parsed !== 'object' || parsed === null) return null;
      const status = (parsed as Record<string, unknown>).error_code;
      const message = (parsed as Record<string, unknown>).error_message;
      if (status === 401) return new AuthenticationError(typeof message === 'string' ? message : 'Unauthorized');
      if (status === 429) return new RateLimitError(typeof message === 'string' ? message : 'Too Many Requests');
      if (typeof status === 'number' && status >= 400) {
        return new ProviderError(
          typeof message === 'string' ? message : 'Provider error',
          'soniox',
          status,
          status,
          parsed,
        );
      }
    } catch {
      // ignore
    }
    if (code === 1006) return new NetworkError('Abnormal closure', true);
    return null;
  };

  const handleMessage = (data: unknown): void => {
    if (typeof data !== 'string') return;
    let msg: SonioxRawMessage | null = null;
    try {
      const parsed: unknown = JSON.parse(data);
      msg = isSonioxRawMessage(parsed) ? parsed : null;
    } catch (err) {
      logger?.warn('soniox message parse failed', {
        module: 'provider-soniox',
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (!msg) return;

    if (typeof msg.error_code === 'number' && typeof msg.error_message === 'string') {
      emitError(new ProviderError(msg.error_message, 'soniox', msg.error_code, msg.error_code, msg));
      setStatus('error');
      return;
    }

    const updateMetadata: Record<string, unknown> = {};
    if (typeof msg.final_audio_proc_ms === 'number' && Number.isFinite(msg.final_audio_proc_ms)) {
      updateMetadata.finalAudioProcMs = msg.final_audio_proc_ms;
    }
    if (typeof msg.total_audio_proc_ms === 'number' && Number.isFinite(msg.total_audio_proc_ms)) {
      updateMetadata.totalAudioProcMs = msg.total_audio_proc_ms;
    }
    if (msg.finished === true) {
      updateMetadata.finished = true;
    }

    const tokens: TranscriptToken[] = [];
    let finalize = false;
    if (msg.tokens && msg.tokens.length > 0) {
      for (const t of msg.tokens) {
        if (isMarker(t.text)) {
          finalize = true;
          continue;
        }
        const token = createToken(t);
        if (token) tokens.push(token);
      }
    }

    if (speakerIdToLabel.size > 0) {
      const speakerLabels: Record<string, string> = {};
      for (const [id, label] of speakerIdToLabel) {
        speakerLabels[String(id)] = label;
      }
      updateMetadata.speakerLabels = speakerLabels;
    }

    const hasMetadata = Object.keys(updateMetadata).length > 0;
    if (tokens.length > 0 || finalize || hasMetadata) {
      const update: TranscriptUpdate = { providerId: 'soniox', tokens, raw: msg };
      if (finalize) update.finalize = true;
      if (hasMetadata) update.metadata = updateMetadata;
      emitUpdate(update);
    }

    if (msg.finished === true) setStatus('disconnected');
  };

  const connect = async (signal?: AbortSignal): Promise<void> => {
    if (connecting) return connecting;
    if (signal?.aborted) throw new AbortedError('Soniox connect aborted');
    setStatus('connecting');

    connecting = (async () => {
      // use resolved from args
      const apiKey = await resolveApiKey(resolved.raw);
      if (signal?.aborted) throw new AbortedError('Soniox connect aborted');

      // Build URL: support baseUrl string or builder from BaseProviderOptions
      const defaultBase = resolved.wsUrl;
      const params = new URLSearchParams();
      const rawQuery = resolved.raw.query;
      if (rawQuery && Object.keys(rawQuery).length > 0) {
        for (const [k, v] of Object.entries(rawQuery)) {
          if (v === null || v === undefined) continue;
          params.set(k, String(v));
        }
      }
      const url = await buildTransportUrl(resolved.raw.baseUrl, defaultBase, params, 'websocket');
      const socket = new WebSocket(url);
      ws = socket;
      socket.binaryType = 'arraybuffer';
      closedByClient = false;

      const onOpen = (): void => {
        // Send initial JSON config per Soniox protocol
        const init: SonioxWsInitConfig = {
          api_key: apiKey,
          model: resolved.raw.model,
          audio_format: resolved.audioFormat,
          num_channels: resolved.channels,
          sample_rate: resolved.sampleRate,
          language_hints: resolved.raw.languageHints,
        };
        if (resolved.raw.diarization === true) {
          init.enable_speaker_diarization = true;
        }
        if (resolved.raw.endpointDetection === true) {
          init.enable_endpoint_detection = true;
        }
        if (resolved.raw.languageIdentification === true) {
          init.enable_language_identification = true;
        }
        try {
          socket.send(JSON.stringify(init));
        } catch (err) {
          emitError(new NetworkError('Failed to send init', true, err));
        }
        setStatus('ready');
        flushQueue();
      };
      const onMessage = (ev: MessageEvent): void => handleMessage(ev.data);
      const onError = (): void => {
        emitError(new NetworkError('Soniox WebSocket error', true));
        setStatus('error');
      };
      const onClose = (ev: CloseEvent): void => {
        const err = mapCloseReason(ev.code, String(ev.reason ?? ''));
        ws = null;
        resetQueue();
        setStatus('disconnected');
        if (!closedByClient && err) emitError(err);
      };

      socket.addEventListener('open', onOpen);
      socket.addEventListener('message', onMessage);
      socket.addEventListener('error', onError);
      socket.addEventListener('close', onClose);
    })();

    return connecting;
  };

  const disconnect = async (): Promise<void> => {
    if (disconnecting) return disconnecting;
    disconnecting = (async () => {
      const socket = ws;
      if (!socket) return;
      try {
        closedByClient = true;
        // Signal end of stream by sending zero‑length frame per Soniox docs
        try {
          socket.send(new ArrayBuffer(0));
        } catch {}
        socket.close(1000, 'client-close');
      } finally {
        ws = null;
        resetQueue();
      }
    })();
    return disconnecting;
  };

  const send = (frame: NormalizedFrame<'pcm16'>): void => {
    enqueue(frame);
  };

  const forceEndpoint = async (): Promise<void> => {
    const socket = ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({ type: 'finalize' }));
    } catch {}
  };

  return {
    get status() {
      return status;
    },
    async connect(signal?: AbortSignal) {
      return connect(signal);
    },
    async disconnect() {
      return disconnect();
    },
    send,
    forceEndpoint,
    onUpdate(handler) {
      updateHandlers.add(handler);
      return () => updateHandlers.delete(handler);
    },
    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
    onStatusChange(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
  };
}
