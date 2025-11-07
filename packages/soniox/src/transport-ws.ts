import type { NormalizedFrame, TranscriptionStream, TranscriptResult } from '@saraudio/core';
import { AbortedError, AuthenticationError, NetworkError, ProviderError, RateLimitError } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { frameDurationMs } from '@saraudio/utils';
import { resolveApiKey } from './auth';
import type { SonioxResolvedConfig } from './config';
import type { SonioxWsFinishedResponse, SonioxWsInitConfig, SonioxWsStreamResponse } from './SonioxWsRealtimeModel';

type StreamStatus = TranscriptionStream['status'];

export function createWsStream(resolved: SonioxResolvedConfig, logger?: Logger): TranscriptionStream {
  let status: StreamStatus = 'idle';
  const partialHandlers = new Set<(text: string) => void>();
  const transcriptHandlers = new Set<(r: TranscriptResult) => void>();
  const errorHandlers = new Set<(e: Error) => void>();
  const statusHandlers = new Set<(s: StreamStatus) => void>();

  let ws: WebSocket | null = null;
  let connecting: Promise<void> | null = null;
  let disconnecting: Promise<void> | null = null;
  let closedByClient = false;

  const queue: { frame: NormalizedFrame<'pcm16'>; dur: number }[] = [];
  let queuedMs = 0;

  // logger is parameter

  const setStatus = (next: StreamStatus): void => {
    if (status === next) return;
    status = next;
    statusHandlers.forEach((h) => h(status));
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

  const emitPartial = (text: string): void => {
    if (!text) return;
    partialHandlers.forEach((h) => h(text));
  };

  const emitFinal = (r: TranscriptResult): void => {
    transcriptHandlers.forEach((h) => h(r));
  };

  const emitError = (e: Error): void => errorHandlers.forEach((h) => h(e));

  const mapCloseReason = (code: number, reasonRaw: string): Error | null => {
    // Soniox typically sends JSON with error_code/error_message in reason
    try {
      const parsed = reasonRaw ? (JSON.parse(reasonRaw) as { error_code?: number; error_message?: string }) : undefined;
      const status = parsed?.error_code;
      if (status === 401) return new AuthenticationError(parsed?.error_message ?? 'Unauthorized');
      if (status === 429) return new RateLimitError(parsed?.error_message ?? 'Too Many Requests');
      if (typeof status === 'number' && status >= 400) {
        return new ProviderError(parsed?.error_message ?? 'Provider error', 'soniox', status, status, parsed);
      }
    } catch {
      // ignore
    }
    if (code === 1006) return new NetworkError('Abnormal closure', true);
    return null;
  };

  const handleMessage = (data: unknown): void => {
    if (typeof data !== 'string') return;
    let msg: (SonioxWsStreamResponse & Partial<SonioxWsFinishedResponse>) | null = null;
    try {
      // Assign parsed JSON directly to declared model type (no guards/casts here)
      msg = JSON.parse(data);
    } catch (err) {
      logger?.warn('soniox message parse failed', {
        module: 'provider-soniox',
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (!msg) return;
    if (msg.tokens && msg.tokens.length > 0) {
      const partialText = msg.tokens
        .filter((t) => !t.is_final)
        .map((t) => t.text ?? '')
        .join(' ')
        .trim();
      if (partialText.length > 0) emitPartial(partialText);

      const finals = msg.tokens.filter((t) => t.is_final);
      if (finals.length > 0) {
        const text = finals
          .map((t) => t.text ?? '')
          .join(' ')
          .trim();
        const words = finals
          .filter((t) => typeof t.start_ms === 'number' && typeof t.end_ms === 'number' && (t.text ?? '').length > 0)
          .map((t) => ({
            word: String(t.text ?? ''),
            startMs: Math.max(0, Math.floor(t.start_ms ?? 0)),
            endMs: Math.max(0, Math.floor(t.end_ms ?? 0)),
            confidence: typeof t.confidence === 'number' ? t.confidence : undefined,
            speaker: typeof t.speaker === 'number' ? t.speaker : undefined,
          }));
        emitFinal({ text, words });
      }
    }
    if (msg.finished) {
      // Server declared end
      setStatus('disconnected');
    }
  };

  const connect = async (signal?: AbortSignal): Promise<void> => {
    if (connecting) return connecting;
    if (signal?.aborted) throw new AbortedError('Soniox connect aborted');
    setStatus('connecting');

    connecting = (async () => {
      // use resolved from args
      const apiKey = await resolveApiKey(resolved.raw);
      if (signal?.aborted) throw new AbortedError('Soniox connect aborted');

      const socket = new WebSocket(resolved.wsUrl);
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
    onTranscript(handler) {
      transcriptHandlers.add(handler);
      return () => transcriptHandlers.delete(handler);
    },
    onPartial(handler) {
      partialHandlers.add(handler);
      return () => partialHandlers.delete(handler);
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
