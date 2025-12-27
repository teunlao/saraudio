import type { NormalizedFrame, TranscriptToken, TranscriptUpdate } from '@saraudio/core';
import { AbortedError, NetworkError, type StreamStatus, type TranscriptionStream } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { frameDurationMs } from '@saraudio/utils';
import type { DeepgramResultsMessage, DeepgramUtteranceEndMessage } from './DeepgramWsModels';
import { type DeepgramErrorMessage, mapClose, mapError } from './errors';

// DeepgramErrorMessage type is imported from ./errors

export interface DeepgramConnectionInfo {
  url: string;
  protocols?: ReadonlyArray<string>;
}

export type DeepgramConnectionInfoFactory = () => Promise<DeepgramConnectionInfo>;

export interface DeepgramStreamConfig {
  connectionFactory: DeepgramConnectionInfoFactory;
  logger?: Logger;
  keepaliveMs: number;
  queueBudgetMs: number;
}

interface QueuedFrame {
  frame: NormalizedFrame<'pcm16'>;
  durationMs: number;
}

export function createDeepgramStream(config: DeepgramStreamConfig): TranscriptionStream {
  let status: StreamStatus = 'idle';
  const updateHandlers = new Set<(update: TranscriptUpdate) => void>();
  const errorHandlers = new Set<(error: Error) => void>();
  const statusHandlers = new Set<(next: StreamStatus) => void>();

  let ws: WebSocket | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let closedByClient = false;
  let connecting: Promise<void> | null = null;
  let disconnecting: Promise<void> | null = null;
  let abortCleanup: (() => void) | null = null;
  let readyEmitted = false;

  const queue: QueuedFrame[] = [];
  let queuedDurationMs = 0;

  const { logger } = config;

  const setStatus = (next: StreamStatus): void => {
    if (status === next) return;
    status = next;
    statusHandlers.forEach((handler) => handler(status));
  };

  const emitUpdate = (update: TranscriptUpdate): void => {
    updateHandlers.forEach((handler) => handler(update));
  };

  const emitError = (error: Error): void => {
    errorHandlers.forEach((handler) => handler(error));
  };

  const clearKeepalive = (): void => {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  };

  const resetQueue = (): void => {
    queue.length = 0;
    queuedDurationMs = 0;
  };

  const flushQueue = (): void => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      queuedDurationMs = Math.max(0, queuedDurationMs - next.durationMs);
      if (next.frame.pcm.length === 0) continue;
      const buffer = sliceBuffer(next.frame.pcm);
      try {
        ws.send(buffer);
      } catch (err) {
        logger?.error('deepgram send failed', {
          module: 'provider-deepgram',
          event: 'send-error',
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }
  };

  const enqueueFrame = (frame: NormalizedFrame<'pcm16'>): void => {
    if (frame.pcm.length === 0) return;
    const durationMs = frameDurationMs(frame.pcm.length, frame.sampleRate, frame.channels);
    queue.push({ frame, durationMs });
    queuedDurationMs += durationMs;

    while (queuedDurationMs > config.queueBudgetMs && queue.length > 1) {
      const dropped = queue.shift();
      if (!dropped) break;
      queuedDurationMs = Math.max(0, queuedDurationMs - dropped.durationMs);
      logger?.warn('deepgram send queue dropped oldest frame (backpressure)', {
        module: 'provider-deepgram',
        event: 'queue-drop',
        queuedDurationMs,
      });
    }

    flushQueue();
  };

  const teardownSocket = (): void => {
    clearKeepalive();
    abortCleanup?.();
    abortCleanup = null;
    readyEmitted = false;
    ws = null;
    resetQueue();
  };

  const handleMessage = (event: MessageEvent): void => {
    if (typeof event.data !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch (err) {
      logger?.warn('deepgram message parse failed', {
        module: 'provider-deepgram',
        event: 'parse-error',
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (!isRecord(parsed)) return;

    const type = typeof parsed.type === 'string' ? parsed.type : undefined;
    if (isDeepgramError(parsed)) {
      const error = mapError(parsed);
      emitError(error);
      setStatus('error');
      return;
    }

    if (type === 'Metadata' && !readyEmitted) {
      readyEmitted = true;
      setStatus('ready');
      return;
    }

    if (isDeepgramResults(parsed)) {
      if (!readyEmitted) {
        readyEmitted = true;
        setStatus('ready');
      }
      handleResultsMessage(parsed, emitUpdate);
      return;
    }

    if (isDeepgramUtteranceEnd(parsed)) {
      emitUpdate({
        providerId: 'deepgram',
        tokens: [],
        finalize: true,
        metadata: buildUtteranceEndMetadata(parsed),
        raw: parsed,
      });
    }
  };

  let lastUrl: string | undefined;

  const maskUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
      const u = new URL(url);
      const redact = (name: string) => {
        if (u.searchParams.has(name)) u.searchParams.set(name, '***');
      };
      redact('token');
      redact('bearer');
      redact('access_token');
      return u.toString();
    } catch {
      return url;
    }
  };

  const handleError = (event: Event): void => {
    const error = new NetworkError(
      lastUrl ? `Deepgram WebSocket error (url=${maskUrl(lastUrl)})` : 'Deepgram WebSocket error',
      true,
      event,
    );
    emitError(error);
    setStatus('error');
  };

  const handleClose = (event: CloseEvent): void => {
    const error = mapClose(event, closedByClient, maskUrl(lastUrl));
    teardownSocket();
    setStatus('disconnected');
    if (!closedByClient && error) {
      emitError(error);
      setStatus('error');
    }
  };

  const connect = async (signal?: AbortSignal): Promise<void> => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      return;
    }
    if (connecting) {
      return connecting;
    }
    setStatus('connecting');

    connecting = (async () => {
      if (signal?.aborted) {
        throw new AbortedError('Deepgram connect aborted');
      }
      const info = await config.connectionFactory();
      lastUrl = info.url;
      if (signal?.aborted) {
        throw new AbortedError('Deepgram connect aborted');
      }

      const protocols = Array.isArray(info.protocols)
        ? [...info.protocols].filter((proto) => typeof proto === 'string' && proto.length > 0)
        : undefined;

      const socket = protocols && protocols.length > 0 ? new WebSocket(info.url, protocols) : new WebSocket(info.url);
      ws = socket;
      socket.binaryType = 'arraybuffer';
      closedByClient = false;

      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const onOpen = (): void => {
          if (settled) return;
          settled = true;
          logger?.debug('deepgram socket open', {
            module: 'provider-deepgram',
            event: 'open',
          });
          setStatus('connected');
          readyEmitted = true;
          setStatus('ready');
          keepaliveTimer = setInterval(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            try {
              ws.send('{"type":"KeepAlive"}');
            } catch (err) {
              logger?.warn('deepgram keepalive send failed', {
                module: 'provider-deepgram',
                event: 'keepalive-error',
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }, config.keepaliveMs);
          flushQueue();
          resolve();
        };

        const onError = (event: Event): void => {
          if (!settled) {
            settled = true;
            const msg = lastUrl ? `Deepgram WebSocket error (url=${maskUrl(lastUrl)})` : 'Deepgram WebSocket error';
            reject(new NetworkError(msg, true, event));
          }
          handleError(event);
        };

        const onClose = (event: CloseEvent): void => {
          if (!settled) {
            settled = true;
            const error = mapClose(event, closedByClient, lastUrl);
            reject(error ?? new NetworkError('Deepgram connection closed before ready'));
          }
          handleClose(event);
        };

        socket.addEventListener('open', onOpen, { once: true });
        socket.addEventListener('message', handleMessage);
        socket.addEventListener('error', onError);
        socket.addEventListener('close', onClose);

        if (signal) {
          const onAbort = (): void => {
            if (settled) return;
            settled = true;
            closedByClient = true;
            reject(new AbortedError('Deepgram connect aborted'));
            try {
              socket.close(1000, 'abort');
            } catch (err) {
              logger?.warn('deepgram abort close failed', {
                module: 'provider-deepgram',
                event: 'abort-close-error',
                error: err instanceof Error ? err.message : String(err),
              });
            }
          };
          signal.addEventListener('abort', onAbort, { once: true });
          abortCleanup = () => {
            signal.removeEventListener('abort', onAbort);
          };
        }
      });
    })();

    try {
      await connecting;
    } finally {
      connecting = null;
    }
  };

  const disconnect = async (): Promise<void> => {
    if (disconnecting) return disconnecting;
    if (!ws) {
      setStatus('disconnected');
      return;
    }

    disconnecting = new Promise<void>((resolve) => {
      const socket = ws;
      if (!socket) {
        resolve();
        return;
      }

      const finish = (): void => {
        teardownSocket();
        setStatus('disconnected');
        resolve();
      };

      socket.addEventListener('close', finish, { once: true });
      closedByClient = true;
      clearKeepalive();
      try {
        socket.send('{"type":"CloseStream"}');
      } catch {}
      try {
        socket.close(1000, 'client');
      } catch (err) {
        logger?.warn('deepgram close failed', {
          module: 'provider-deepgram',
          event: 'close-error',
          error: err instanceof Error ? err.message : String(err),
        });
        finish();
      }
    });

    try {
      await disconnecting;
    } finally {
      disconnecting = null;
    }
  };

  return {
    get status(): StreamStatus {
      return status;
    },
    async connect(signal?: AbortSignal) {
      await connect(signal);
    },
    async disconnect() {
      await disconnect();
    },
    send(frame: NormalizedFrame<'pcm16'>) {
      enqueueFrame(frame);
    },
    async forceEndpoint() {
      // Deepgram Listen v1 does not support explicit force endpoint.
      logger?.debug('deepgram forceEndpoint noop (provider does not support it)', {
        module: 'provider-deepgram',
        event: 'force-endpoint',
      });
    },
    onUpdate(handler: (update: TranscriptUpdate) => void) {
      updateHandlers.add(handler);
      return () => updateHandlers.delete(handler);
    },
    onError(handler: (error: Error) => void) {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },
    onStatusChange(handler: (next: StreamStatus) => void) {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },
  } satisfies TranscriptionStream;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeepgramResults(value: unknown): value is DeepgramResultsMessage {
  return isRecord(value) && isRecord(value.channel);
}

function isDeepgramError(value: unknown): value is DeepgramErrorMessage {
  if (!isRecord(value)) return false;
  return value.type === 'Error' || typeof value.err_code === 'number' || typeof value.status === 'number';
}

function isDeepgramUtteranceEnd(value: unknown): value is DeepgramUtteranceEndMessage {
  return isRecord(value) && value.type === 'UtteranceEnd';
}

function buildUtteranceEndMetadata(message: DeepgramUtteranceEndMessage): Record<string, unknown> {
  const metadata: Record<string, unknown> = { type: 'UtteranceEnd' };
  if (Array.isArray(message.channel)) metadata.channel = message.channel;
  if (typeof message.last_word_end === 'number' && Number.isFinite(message.last_word_end)) {
    metadata.lastWordEndMs = Math.round(message.last_word_end * 1000);
  }
  return metadata;
}

function handleResultsMessage(message: DeepgramResultsMessage, emitUpdate: (update: TranscriptUpdate) => void): void {
  const alternative = message.channel?.alternatives?.[0];
  if (!alternative) return;
  const transcript = alternative.transcript ?? '';
  const isFinal = message.is_final === true || message.speech_final === true;

  const tokens: TranscriptToken[] = [];
  if (alternative.words && alternative.words.length > 0) {
    for (const word of alternative.words) {
      const rawWord = typeof word.word === 'string' ? word.word : '';
      const punctuatedWord = typeof word.punctuated_word === 'string' ? word.punctuated_word : undefined;
      const displayWord = punctuatedWord ?? rawWord;
      if (!displayWord) continue;

      const token: TranscriptToken = { text: `${displayWord} `, isFinal };
      if (typeof word.start === 'number' && Number.isFinite(word.start)) token.startMs = Math.round(word.start * 1000);
      if (typeof word.end === 'number' && Number.isFinite(word.end)) token.endMs = Math.round(word.end * 1000);
      if (typeof word.confidence === 'number' && Number.isFinite(word.confidence)) token.confidence = word.confidence;
      if (typeof word.speaker === 'number' && Number.isFinite(word.speaker)) token.speaker = word.speaker;

      const tokenMetadata: Record<string, unknown> = {};
      if (rawWord) tokenMetadata.rawWord = rawWord;
      if (punctuatedWord) tokenMetadata.punctuatedWord = punctuatedWord;
      if (Object.keys(tokenMetadata).length > 0) token.metadata = tokenMetadata;

      tokens.push(token);
    }
  } else if (transcript) {
    tokens.push({ text: transcript, isFinal });
  }

  const updateMetadata = buildMetadata(message);
  const span = computeSpan(message);
  const language = typeof alternative.language === 'string' ? alternative.language : extractDetectedLanguage(message);

  if (tokens.length === 0 && message.speech_final !== true) return;

  const update: TranscriptUpdate = { providerId: 'deepgram', tokens, raw: message };
  if (message.speech_final === true) update.finalize = true;
  if (span) update.span = span;
  if (language) update.language = language;
  if (updateMetadata) update.metadata = updateMetadata;
  emitUpdate(update);
}

function computeSpan(message: DeepgramResultsMessage): TranscriptUpdate['span'] {
  if (typeof message.start === 'number' && typeof message.end === 'number') {
    return {
      startMs: Math.round(message.start * 1000),
      endMs: Math.round(message.end * 1000),
    };
  }
  if (typeof message.start === 'number' && typeof message.duration === 'number') {
    const startMs = Math.round(message.start * 1000);
    const endMs = Math.round((message.start + message.duration) * 1000);
    return { startMs, endMs };
  }
  return undefined;
}

function extractDetectedLanguage(message: DeepgramResultsMessage): string | undefined {
  const metadata = message.metadata;
  if (!metadata) return undefined;
  const detected = metadata.detected_language ?? metadata.detectedLanguages;
  if (typeof detected === 'string' && detected.length > 0) {
    return detected;
  }
  return undefined;
}

function buildMetadata(message: DeepgramResultsMessage): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  if (typeof message.type === 'string') {
    meta.type = message.type;
  }
  if (Array.isArray(message.channel_index)) {
    meta.channelIndex = [...message.channel_index];
  }
  if (typeof message.is_final === 'boolean') {
    meta.isFinal = message.is_final;
  }
  if (typeof message.speech_final === 'boolean') {
    meta.speechFinal = message.speech_final;
  }
  if (isRecord(message.metadata)) {
    const requestId = message.metadata.request_id;
    if (typeof requestId === 'string') {
      meta.requestId = requestId;
    }
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function sliceBuffer(view: Int16Array): ArrayBuffer {
  const buffer = view.buffer;
  const isShared = typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer;
  if (!isShared && view.byteOffset === 0 && view.byteLength === buffer.byteLength && buffer instanceof ArrayBuffer) {
    return buffer;
  }
  const copy = view.slice();
  return copy.buffer;
}
