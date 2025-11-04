import type {
  BatchTranscriptionProvider,
  NormalizedFrame,
  Recorder,
  StreamStatus,
  TranscriptionProvider,
  TranscriptionStream,
  TranscriptResult,
  Transport,
} from '@saraudio/core';
import { encodeWavPcm16, isRetryable, RateLimitError } from '@saraudio/core';

import type { Logger } from '@saraudio/utils';
import { createDeferred, createHttpLiveAggregator, type Deferred, type HttpLiveAggregator } from '@saraudio/utils';

export interface CreateTranscriptionOptions {
  provider: TranscriptionProvider;
  recorder?: Recorder;
  logger?: Logger;
  liveTransport?: 'auto' | 'ws' | 'http';
  flushOnSegmentEnd?: boolean;
  /** Max duration of pre-connect audio buffer to avoid losing early speech (ms). Default: 60, soft-max: 120. */
  preconnectBufferMs?: number;
  /** Chunked sending options for HTTP providers (ignored for WebSocket). */
  chunking?: {
    intervalMs?: number;
    minDurationMs?: number;
    overlapMs?: number;
    maxInFlight?: number;
    timeoutMs?: number;
  };
  /** Retry policy for transient errors. */
  retry?: {
    enabled?: boolean;
    maxAttempts?: number; // total attempts including the first one
    baseDelayMs?: number; // base backoff
    factor?: number; // exponential factor
    maxDelayMs?: number; // cap
    jitterRatio?: number; // 0..1, multiplicative jitter
  };
  // httpClient?: HttpClient // YAGNI: добавим при первой HTTP интеграции
}

export interface TranscriptionController {
  readonly status: StreamStatus;
  readonly transport: Transport;
  readonly error: Error | null;
  readonly isConnected: boolean;
  connect(signal?: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  clear(): void;
  forceEndpoint(): Promise<void>;
  onPartial(handler: (text: string) => void): () => void;
  onTranscript(handler: (result: TranscriptResult) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  onStatusChange(handler: (status: StreamStatus) => void): () => void;
  // Present only when controller created its own recorder in higher layers
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  recorder?: Recorder;
}

export function createTranscription(opts: CreateTranscriptionOptions): TranscriptionController {
  const { provider, recorder, logger } = opts;
  let status: StreamStatus = 'idle';
  let stream: TranscriptionStream | null = null;
  let lastError: Error | null = null;
  let connected = false;

  const partialSubs = new Set<(t: string) => void>();
  const transcriptSubs = new Set<(r: TranscriptResult) => void>();
  const errorSubs = new Set<(e: Error) => void>();
  const statusSubs = new Set<(s: StreamStatus) => void>();
  let unsubscribeRecorder: (() => void) | null = null;
  let unsubscribeSegment: (() => void) | null = null;
  let unsubscribeStream: Array<() => void> = [];
  let aggregator: HttpLiveAggregator<TranscriptResult> | null = null;
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
  const retryCfg = { ...retryDefaults, ...(opts.retry ?? {}) };

  const computeBackoff = (attempt: number, err?: unknown): number => {
    if (err instanceof RateLimitError && typeof err.retryAfterMs === 'number' && err.retryAfterMs > 0) {
      return Math.min(err.retryAfterMs, retryCfg.maxDelayMs);
    }
    const exp = Math.min(retryCfg.baseDelayMs * retryCfg.factor ** Math.max(0, attempt - 1), retryCfg.maxDelayMs);
    if (!retryCfg.jitterRatio) return exp;
    const jitter = exp * retryCfg.jitterRatio * (Math.random() - 0.5) * 2;
    return Math.max(0, Math.min(retryCfg.maxDelayMs, Math.floor(exp + jitter)));
  };

  // onReady buffer: keep a small pre-connect buffer to avoid losing the beginning of speech
  const DEFAULT_PRECONNECT_MS = 60;
  const SOFT_MAX_PRECONNECT_MS = 120;
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

  const preconnectBuffer: Array<NormalizedFrame<'pcm16'>> = [];
  let preconnectBufferedMs = 0;

  const frameDurationMs = (f: NormalizedFrame<'pcm16'>): number => {
    const samples = f.pcm.length;
    const duration = (samples / (f.sampleRate * f.channels)) * 1000;
    return duration;
  };

  const pushPreconnect = (f: NormalizedFrame<'pcm16'>): void => {
    preconnectBuffer.push(f);
    preconnectBufferedMs += frameDurationMs(f);
    // Trim from the head while exceeding the time budget
    while (preconnectBufferedMs > maxPreconnectMs && preconnectBuffer.length > 1) {
      const dropped = preconnectBuffer.shift();
      if (dropped) preconnectBufferedMs -= frameDurationMs(dropped);
    }
  };

  const setStatus = (next: StreamStatus): void => {
    if (status === next) return;
    status = next;
    statusSubs.forEach((h) => h(status));
  };

  const isBatchProvider = (p: TranscriptionProvider): p is BatchTranscriptionProvider =>
    typeof (p as BatchTranscriptionProvider).transcribe === 'function';

  const ensureStream = (): TranscriptionStream => {
    if (!stream) {
      stream = provider.stream();
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
    const delay = computeBackoff(attempts, err);
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
      void attemptConnect(signal);
    }, delay);
  };

  const wireStream = (s: TranscriptionStream, signal?: AbortSignal): void => {
    unsubscribeStreamHandlers();
    unsubscribeStream.push(
      s.onTranscript((r: TranscriptResult) => transcriptSubs.forEach((h) => h(r))),
      s.onError((e: Error) => {
        lastError = e;
        errorSubs.forEach((h) => h(e));
        startRetry(e, signal);
      }),
      s.onStatusChange((st: StreamStatus) => setStatus(st)),
    );
    if (s.onPartial) {
      unsubscribeStream.push(s.onPartial((t: string) => partialSubs.forEach((h) => h(t))));
    }
  };

  const attemptConnect = async (signal?: AbortSignal): Promise<void> => {
    setStatus('connecting');
    attempts += 1;
    // HTTP path: chunking aggregator instead of WS stream
    if (provider.transport === 'http' && isBatchProvider(provider)) {
      if (!aggregator) {
        aggregator = createHttpLiveAggregator<TranscriptResult>({
          intervalMs: opts.chunking?.intervalMs,
          minDurationMs: opts.chunking?.minDurationMs,
          overlapMs: opts.chunking?.overlapMs,
          maxInFlight: opts.chunking?.maxInFlight,
          timeoutMs: opts.chunking?.timeoutMs,
          onFlush: async ({ pcm, sampleRate, channels, signal: flushSignal }) => {
            const wav = encodeWavPcm16(pcm, { sampleRate, channels });
            return await provider.transcribe(wav, undefined, flushSignal);
          },
          onResult: (res) => {
            transcriptSubs.forEach((h) => h(res));
            if (res.text) partialSubs.forEach((h) => h(res.text));
          },
          onError: (err) => {
            lastError = (err as Error) ?? new Error('HTTP chunk flush failed');
            errorSubs.forEach((h) => h(lastError as Error));
            setStatus('error');
          },
          logger,
        });
      }
      connected = true;
      if (preconnectBuffer.length > 0) {
        for (let i = 0; i < preconnectBuffer.length; i += 1) {
          const f = preconnectBuffer[i];
          aggregator.push({ pcm: f.pcm, sampleRate: f.sampleRate, channels: f.channels });
        }
        preconnectBuffer.length = 0;
        preconnectBufferedMs = 0;
      }
      if (recorder && opts.flushOnSegmentEnd === true) {
        const FORCE_COOLDOWN_MS = 200;
        let lastForceTs = 0;
        unsubscribeSegment = recorder.onSegment(() => {
          const now = Date.now();
          if (now - lastForceTs < FORCE_COOLDOWN_MS) return;
          lastForceTs = now;
          logger?.debug('force flush on segment end', {
            module: 'runtime-base',
            event: 'segment-end',
            providerId: provider.id,
          });
          aggregator?.forceFlush();
        });
      }
      setStatus('connected');
      logger?.debug('connected', {
        module: 'runtime-base',
        event: 'connect',
        providerId: provider.id,
        transport: 'http',
      });
      attempts = 0;
      connectDeferred?.resolve();
      connectDeferred = null;
      return;
    }

    const stream = ensureStream();
    wireStream(stream, signal);
    try {
      await stream.connect(signal);
      // Flush preconnect buffer first-in-first-out
      if (preconnectBuffer.length > 0) {
        for (let i = 0; i < preconnectBuffer.length; i += 1) {
          stream.send(preconnectBuffer[i]);
        }
        preconnectBuffer.length = 0;
        preconnectBufferedMs = 0;
      }
      // Subscribe to segment end → force endpoint when requested and supported
      if (recorder && opts.flushOnSegmentEnd === true) {
        if (provider.capabilities.forceEndpoint) {
          const FORCE_COOLDOWN_MS = 200;
          let lastForceTs = 0;
          unsubscribeSegment = recorder.onSegment(() => {
            const now = Date.now();
            if (now - lastForceTs < FORCE_COOLDOWN_MS) return;
            lastForceTs = now;
            logger?.debug('forceEndpoint on segment end', {
              module: 'runtime-base',
              event: 'segment-end',
              providerId: provider.id,
            });
            void stream.forceEndpoint();
          });
        } else {
          logger?.debug('flushOnSegmentEnd requested but provider does not support forceEndpoint', {
            module: 'runtime-base',
            providerId: provider.id,
          });
        }
      }
      connected = true;
      setStatus('connected');
      logger?.debug('connected', { module: 'runtime-base', event: 'connect', providerId: provider.id });
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
    connectDeferred = createDeferred<void>();
    attempts = 0;
    await attemptConnect(signal);
    if (connectDeferred) await connectDeferred.promise;
  };

  const disconnect = async (): Promise<void> => {
    try {
      if (unsubscribeRecorder) {
        unsubscribeRecorder();
        unsubscribeRecorder = null;
      }
      if (unsubscribeSegment) {
        unsubscribeSegment();
        unsubscribeSegment = null;
      }
      cleanupRetry();
      connectDeferred?.resolve();
      connectDeferred = null;
      if (aggregator) {
        aggregator.close(true);
        aggregator = null;
      }
      if (stream) {
        await stream.disconnect();
      }
    } finally {
      unsubscribeStreamHandlers();
      connected = false;
      setStatus('disconnected');
    }
  };

  const forceEndpoint = async (): Promise<void> => {
    if (provider.transport === 'http' && aggregator) {
      aggregator.forceFlush();
      return;
    }
    const stream = ensureStream();
    await stream.forceEndpoint();
  };

  const clear = (): void => {
    preconnectBuffer.length = 0;
    preconnectBufferedMs = 0;
  };

  if (recorder) {
    unsubscribeRecorder = recorder.subscribeFrames((frame) => {
      if (!connected) {
        pushPreconnect(frame);
      } else if (provider.transport === 'http' && aggregator) {
        aggregator.push({ pcm: frame.pcm, sampleRate: frame.sampleRate, channels: frame.channels });
      } else if (stream) {
        stream.send(frame);
      }
    });
  }

  return {
    get status() {
      return status;
    },
    get transport() {
      return provider.transport;
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
    onPartial: (h) => {
      partialSubs.add(h);
      return () => partialSubs.delete(h);
    },
    onTranscript: (h) => {
      transcriptSubs.add(h);
      return () => transcriptSubs.delete(h);
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
