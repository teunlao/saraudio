import type {
  Recorder,
  StreamStatus,
  TranscriptionProvider,
  TranscriptionStream,
  TranscriptUpdate,
  Transport,
} from '@saraudio/core';
import { isRetryable, RateLimitError } from '@saraudio/core';

import type { Logger } from '@saraudio/utils';
import { computeBackoff, createDeferred, type Deferred, type RetryConfig } from '@saraudio/utils';

import { PreconnectBuffer } from './helpers/preconnect-buffer';
import { createHttpTransport } from './transports/http-transport';
import { connectWsTransport } from './transports/ws-transport';

type ProviderUpdateOptions<P extends TranscriptionProvider> = Parameters<P['update']>[0];

export interface RetryOptions {
  enabled?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
}

export interface HttpChunkingOptions {
  intervalMs?: number;
  minDurationMs?: number;
  overlapMs?: number;
  maxInFlight?: number;
  timeoutMs?: number;
}

export interface ConnectionOptions {
  ws?: {
    /**
     * How to handle silence in WebSocket mode.
     * - 'keep' (default): send all frames continuously
     * - 'drop': send only during speech (based on VAD)
     * - 'mute': keep cadence by sending zeroed frames during silence
     */
    silencePolicy?: 'keep' | 'drop' | 'mute';
    /** Retry policy for transient errors. */
    retry?: RetryOptions;
  };
  http?: {
    /** Chunked sending options for HTTP providers. */
    chunking?: HttpChunkingOptions;
  };
}

export interface CreateTranscriptionOptions<P extends TranscriptionProvider = TranscriptionProvider> {
  provider: P;
  recorder?: Recorder;
  logger?: Logger;
  /** Select transport at controller level. Default 'auto'. */
  transport?: 'auto' | 'websocket' | 'http';
  flushOnSegmentEnd?: boolean;
  /** Max duration of pre-connect audio buffer to avoid losing early speech (ms). Default: 60, soft-max: 120. */
  preconnectBufferMs?: number;
  /** Connection options for WebSocket and HTTP transports. */
  connection?: ConnectionOptions;
  // httpClient?: HttpClient // YAGNI: добавим при первой HTTP интеграции
}

export interface TranscriptionController<P extends TranscriptionProvider = TranscriptionProvider> {
  readonly status: StreamStatus;
  readonly transport: Transport;
  readonly error: Error | null;
  readonly isConnected: boolean;
  connect(signal?: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  clear(): void;
  forceEndpoint(): Promise<void>;
  updateProvider(options: ProviderUpdateOptions<P>): Promise<void>;
  onUpdate(handler: (update: TranscriptUpdate) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  onStatusChange(handler: (status: StreamStatus) => void): () => void;
  // Present only when controller created its own recorder in higher layers
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  recorder?: Recorder;
}

export function createTranscription<P extends TranscriptionProvider>(
  opts: CreateTranscriptionOptions<P>,
): TranscriptionController<P> {
  const { provider, recorder, logger } = opts;
  let status: StreamStatus = 'idle';
  let stream: TranscriptionStream | null = null;
  let streamNeedsRefresh = false;
  let lastError: Error | null = null;
  let connected = false;
  // Selected transport for this controller instance. Calculated at first connect if 'auto'.
  let selectedTransport: Transport | null = null;

  const updateSubs = new Set<(u: TranscriptUpdate) => void>();
  const errorSubs = new Set<(e: Error) => void>();
  const statusSubs = new Set<(s: StreamStatus) => void>();
  let unsubscribeRecorder: (() => void) | null = null;
  let unsubscribeSegment: (() => void) | null = null;
  let unsubscribeVad: (() => void) | null = null;
  let unsubscribeStream: Array<() => void> = [];
  let httpTransport: ReturnType<typeof createHttpTransport> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let connectDeferred: Deferred<void> | null = null;
  let attempts = 0;
  const retryDefaults = {
    enabled: true,
    maxAttempts: 3,
    baseDelayMs: 300,
    factor: 2,
    maxDelayMs: 10_000,
    jitterRatio: 0,
  };
  const retryCfg = { ...retryDefaults, ...(opts.connection?.ws?.retry ?? {}) };
  const retryConfig: RetryConfig = {
    baseDelayMs: retryCfg.baseDelayMs,
    factor: retryCfg.factor,
    maxDelayMs: retryCfg.maxDelayMs,
    jitterRatio: retryCfg.jitterRatio,
  };

  // onReady buffer: cover handshake window to avoid losing early speech
  // Default 120ms, soft‑max 250ms based on typical 2*RTT for WS/TLS on mobile networks
  const DEFAULT_PRECONNECT_MS = 120;
  const SOFT_MAX_PRECONNECT_MS = 250;
  const requestedPreconnect = opts.preconnectBufferMs;
  let maxPreconnectMs = DEFAULT_PRECONNECT_MS;
  if (typeof requestedPreconnect === 'number') {
    if (requestedPreconnect < 0) {
      maxPreconnectMs = 0;
      logger?.warn('preconnectBufferMs clamped to 0 ms (negative provided)', {
        module: 'runtime-base',
        provided: requestedPreconnect,
        clampedTo: 0,
      });
    } else if (requestedPreconnect > SOFT_MAX_PRECONNECT_MS) {
      maxPreconnectMs = SOFT_MAX_PRECONNECT_MS;
      logger?.warn('preconnectBufferMs clamped to soft max', {
        module: 'runtime-base',
        provided: requestedPreconnect,
        clampedTo: SOFT_MAX_PRECONNECT_MS,
      });
    } else {
      maxPreconnectMs = requestedPreconnect;
    }
  }

  const preconnectBuffer = new PreconnectBuffer(maxPreconnectMs);

  const setStatus = (next: StreamStatus): void => {
    if (status === next) return;
    status = next;
    statusSubs.forEach((h) => h(status));
  };

  const isHttpCapable = (
    p: TranscriptionProvider,
  ): p is TranscriptionProvider & Required<Pick<TranscriptionProvider, 'transcribe'>> =>
    typeof p.transcribe === 'function';
  const isWsCapable = (
    p: TranscriptionProvider,
  ): p is TranscriptionProvider & Required<Pick<TranscriptionProvider, 'stream'>> => typeof p.stream === 'function';

  const ensureStream = (): TranscriptionStream => {
    if (selectedTransport !== 'websocket') {
      throw new Error('Stream is only available for WebSocket providers');
    }
    if (streamNeedsRefresh) {
      if (connected) {
        if (stream) {
          return stream;
        }
        throw new Error('Stream requested while connected but not initialized');
      }
      if (stream) {
        unsubscribeStreamHandlers();
        stream = null;
      }
      streamNeedsRefresh = false;
    }
    if (!stream) {
      if (!isWsCapable(provider)) {
        throw new Error('Provider does not support WebSocket streaming');
      }
      stream = provider.stream();
    }
    if (!stream) {
      throw new Error('Provider returned null stream');
    }
    return stream;
  };

  const unsubscribeStreamHandlers = (): void => {
    if (unsubscribeStream.length > 0) {
      for (let i = 0; i < unsubscribeStream.length; i += 1) unsubscribeStream[i]();
      unsubscribeStream = [];
    }
  };

  const cleanupRetry = (): void => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  provider.onUpdate(() => {
    streamNeedsRefresh = true;
    if (!connected) {
      if (stream) {
        unsubscribeStreamHandlers();
        stream = null;
      }
      if (httpTransport) {
        httpTransport.aggregator.close(true);
        httpTransport = null;
      }
      return;
    }
    logger?.info('provider updated while connected; changes apply after reconnect', {
      module: 'runtime-base',
      event: 'provider.update',
      providerId: provider.id,
    });
  });

  const startRetry = (err: unknown, signal?: AbortSignal): void => {
    if (!retryCfg.enabled) {
      connectDeferred?.resolve();
      connectDeferred = null;
      setStatus('error');
      return;
    }
    if (!isRetryable(err) || attempts >= Math.max(1, retryCfg.maxAttempts)) {
      connectDeferred?.resolve();
      connectDeferred = null;
      setStatus('error');
      return;
    }
    const delay = computeBackoff(attempts, retryConfig, err instanceof RateLimitError ? err : undefined);
    logger?.debug('retry scheduled', {
      module: 'runtime-base',
      event: 'retry',
      attempt: attempts,
      delayMs: delay,
      providerId: provider.id,
    });
    connected = false;
    // keep recorder subscription active to feed preconnect buffer
    cleanupRetry();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      // prepare new stream and re-attempt
      stream = null;
      streamNeedsRefresh = false;
      void attemptConnect(signal);
    }, delay);
  };

  const wireStream = (stream: TranscriptionStream, signal?: AbortSignal): void => {
    unsubscribeStreamHandlers();
    unsubscribeStream.push(
      stream.onUpdate((u: TranscriptUpdate) => updateSubs.forEach((h) => h(u))),
      stream.onError((e: Error) => {
        lastError = e;
        errorSubs.forEach((h) => h(e));
        startRetry(e, signal);
      }),
      stream.onStatusChange((status: StreamStatus) => setStatus(status)),
    );
  };

  const attemptConnect = async (signal?: AbortSignal): Promise<void> => {
    setStatus('connecting');
    attempts += 1;

    // Resolve selected transport
    if (!selectedTransport) {
      const requested = opts.transport ?? 'auto';
      if (requested === 'websocket') selectedTransport = 'websocket';
      else if (requested === 'http') selectedTransport = 'http';
      else {
        selectedTransport = isWsCapable(provider) ? 'websocket' : isHttpCapable(provider) ? 'http' : 'websocket';
      }
    }

    if (selectedTransport === 'http') {
      if (!httpTransport) {
        // If user wants segment-driven semantics, default intervalMs to 0 (no timer) unless explicitly provided.
        const userInterval = opts.connection?.http?.chunking?.intervalMs;
        const effectiveInterval = userInterval === undefined && opts.flushOnSegmentEnd === true ? 0 : userInterval;

        if ((effectiveInterval ?? 0) <= 0 && opts.flushOnSegmentEnd !== true) {
          logger?.warn(
            'HTTP intervalMs=0 without flushOnSegmentEnd: no automatic flush; call forceEndpoint() or disconnect()',
            {
              module: 'runtime-base',
              event: 'http.config.warn',
            },
          );
        } else if ((effectiveInterval ?? 0) <= 0 && opts.flushOnSegmentEnd === true) {
          logger?.debug('HTTP segment-only mode (intervalMs=0, flushOnSegmentEnd=true)', {
            module: 'runtime-base',
            event: 'http.config',
          });
        }

        httpTransport = createHttpTransport({
          provider,
          logger,
          preconnectBuffer,
          onUpdate: (update) => updateSubs.forEach((h) => h(update)),
          onError: (err) => {
            lastError = err;
            errorSubs.forEach((h) => h(err));
            setStatus('error');
          },
          chunking: { ...opts.connection?.http?.chunking, intervalMs: effectiveInterval },
        });
      }
      connected = true;
      setStatus('connected');
      attempts = 0;
      connectDeferred?.resolve();
      connectDeferred = null;
      return;
    }

    if (!isWsCapable(provider)) {
      throw new Error('Provider does not support WebSocket streaming');
    }
    const streamRef = ensureStream();
    wireStream(streamRef, signal);
    try {
      await connectWsTransport(
        {
          logger,
          stream: streamRef,
          preconnectBuffer,
          providerId: provider.id,
        },
        signal,
      );
      connected = true;
      setStatus('connected');
      attempts = 0;
      connectDeferred?.resolve();
      connectDeferred = null;
    } catch (e) {
      lastError = e as Error;
      errorSubs.forEach((h) => h(lastError as Error));
      startRetry(e, signal);
      if (!connectDeferred) connectDeferred = createDeferred<void>();
    }
  };

  const connect = async (signal?: AbortSignal): Promise<void> => {
    cleanupRetry();
    if (connectDeferred) {
      // already trying; wait for completion
      await connectDeferred.promise;
      return;
    }
    if (recorder) {
      if (unsubscribeRecorder) {
        unsubscribeRecorder();
      }
      // Start with all frames; after transport is resolved, we'll re-subscribe if HTTP+segment-only.
      const silencePolicy = opts.connection?.ws?.silencePolicy ?? 'keep';
      let speechActive = false;
      if (silencePolicy === 'drop' || silencePolicy === 'mute') {
        if (unsubscribeVad) unsubscribeVad();
        unsubscribeVad = recorder.onVad((v) => {
          speechActive = v.speech;
        });
      }
      unsubscribeRecorder = recorder.subscribeFrames((frame) => {
        if (!connected) {
          preconnectBuffer.push(frame);
        } else if (httpTransport) {
          httpTransport.aggregator.push({ pcm: frame.pcm, sampleRate: frame.sampleRate, channels: frame.channels });
        } else if (stream) {
          if (selectedTransport === 'websocket') {
            if (silencePolicy === 'keep') {
              stream.send(frame);
            } else if (silencePolicy === 'drop') {
              if (speechActive) stream.send(frame);
            } else {
              // mute: keep cadence with zeroed frames during silence
              if (speechActive) {
                stream.send(frame);
              } else {
                const zeros = new Int16Array(frame.pcm.length);
                stream.send({ ...frame, pcm: zeros });
              }
            }
          } else {
            stream.send(frame);
          }
        }
      });

      if (opts.flushOnSegmentEnd === true) {
        if (unsubscribeSegment) {
          unsubscribeSegment();
        }
        const FORCE_COOLDOWN_MS = 200;
        let lastForceTs = 0;
        unsubscribeSegment = recorder.onSegment(() => {
          const now = Date.now();
          if (now - lastForceTs < FORCE_COOLDOWN_MS) return;
          lastForceTs = now;

          if (httpTransport) {
            logger?.debug('force flush on segment end', {
              module: 'runtime-base',
              event: 'segment-end',
              providerId: provider.id,
            });
            httpTransport.aggregator.forceFlush();
          } else if (stream && provider.capabilities.forceEndpoint) {
            logger?.debug('forceEndpoint on segment end', {
              module: 'runtime-base',
              event: 'segment-end',
              providerId: provider.id,
            });
            void stream.forceEndpoint();
          }
        });
      }
    }
    connectDeferred = createDeferred<void>();
    attempts = 0;
    await attemptConnect(signal);
    if (connectDeferred) await connectDeferred.promise;
    // After connect, if we are on HTTP and segment-only is enabled, switch to speech-gated subscription.
    if (recorder && selectedTransport === 'http' && opts.flushOnSegmentEnd === true) {
      if (unsubscribeRecorder) {
        unsubscribeRecorder();
      }
      unsubscribeRecorder = recorder.subscribeSpeechFrames((frame) => {
        if (!connected) {
          preconnectBuffer.push(frame);
        } else if (httpTransport) {
          httpTransport.aggregator.push({ pcm: frame.pcm, sampleRate: frame.sampleRate, channels: frame.channels });
        }
      });
    }
  };

  const disconnect = async (): Promise<void> => {
    try {
      if (unsubscribeRecorder) {
        unsubscribeRecorder();
        unsubscribeRecorder = null;
      }
      if (unsubscribeVad) {
        unsubscribeVad();
        unsubscribeVad = null;
      }
      if (unsubscribeSegment) {
        unsubscribeSegment();
        unsubscribeSegment = null;
      }
      cleanupRetry();
      connectDeferred?.resolve();
      connectDeferred = null;
      preconnectBuffer.clear();
      if (httpTransport) {
        httpTransport.aggregator.close(true);
        httpTransport = null;
      }
      if (stream) {
        await stream.disconnect();
      }
    } finally {
      unsubscribeStreamHandlers();
      connected = false;
      setStatus('disconnected');
      stream = null;
    }
  };

  const forceEndpoint = async (): Promise<void> => {
    if (selectedTransport === 'http' && httpTransport) {
      httpTransport.aggregator.forceFlush();
      return;
    }
    const streamRef = ensureStream();
    await streamRef.forceEndpoint();
  };

  const clear = (): void => {
    preconnectBuffer.clear();
  };

  if (recorder) {
    unsubscribeRecorder = recorder.subscribeFrames((frame) => {
      if (!connected) {
        preconnectBuffer.push(frame);
      }
    });
  }

  const updateProvider = async (options: ProviderUpdateOptions<P>): Promise<void> => {
    await provider.update(options);
  };

  return {
    get status() {
      return status;
    },
    get transport() {
      return (selectedTransport ?? (opts.transport === 'http' ? 'http' : 'websocket')) as Transport;
    },
    get error() {
      return lastError;
    },
    get isConnected() {
      return connected;
    },
    connect,
    disconnect,
    clear,
    forceEndpoint,
    updateProvider,
    onUpdate: (h) => {
      updateSubs.add(h);
      return () => updateSubs.delete(h);
    },
    onError: (h) => {
      errorSubs.add(h);
      return () => errorSubs.delete(h);
    },
    onStatusChange: (h) => {
      statusSubs.add(h);
      return () => statusSubs.delete(h);
    },
    recorder,
  };
}
