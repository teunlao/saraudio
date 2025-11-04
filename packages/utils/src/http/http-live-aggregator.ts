import type { Logger } from '../logger';

/**
 * A single normalized PCM16 frame for the HTTP live aggregator.
 * - `pcm` is mono or stereo 16‑bit PCM samples.
 * - `sampleRate` and `channels` must stay constant for a given aggregator instance.
 */

export interface AggregatorFrame {
  pcm: Int16Array;
  sampleRate: number;
  channels: 1 | 2;
}

/**
 * Options for {@link createHttpLiveAggregator}.
 *
 * Behavior and defaults:
 * - `intervalMs` (default: 3000): periodic timer to attempt a flush.
 * - `minDurationMs` (default: 700): do not flush by timer until at least this many ms of audio is accumulated.
 * - `overlapMs` (default: 500): copy the last N ms of the previous chunk as a tail to the next to improve continuity.
 * - `maxInFlight` (default: 1): limit concurrent `onFlush` operations; values < 1 are clamped to 1 with a warn.
 * - `timeoutMs` (default: 10000): per‑flush timeout; aborts the `onFlush` call via `AbortSignal`.
 * - `onFlush`: required async callback to send a chunk to the provider.
 * - `onResult`: optional callback to deliver provider result to the caller.
 * - `onError`: optional callback invoked when `onFlush` throws or times out; error is also logged.
 * - `logger`: optional logger for debug/warn/error events (no secrets logged).
 */
export interface HttpLiveAggregatorOptions<T> {
  intervalMs?: number; // timer-based flush
  minDurationMs?: number; // minimum audio to accumulate before timer flush
  overlapMs?: number; // tail to prepend to next chunk for continuity
  maxInFlight?: number; // limit concurrent flushes
  timeoutMs?: number; // per-flush timeout
  onFlush: (chunk: { pcm: Int16Array; sampleRate: number; channels: 1 | 2; signal: AbortSignal }) => Promise<T>;
  onResult?: (result: T) => void;
  onError?: (error: unknown) => void;
  logger?: Logger;
}

/**
 * Lightweight HTTP live aggregation facade.
 *
 * Accumulates PCM frames and periodically (or explicitly) flushes them via `onFlush`.
 * Provides overlap support, in‑flight limiting, and per‑flush timeouts via `AbortSignal`.
 *
 * Lifecycle:
 * - Push frames with {@link HttpLiveAggregator.push}.
 * - Periodic timer tries to flush when `minDurationMs` is reached.
 * - Call {@link HttpLiveAggregator.forceFlush} to flush immediately (ignores `minDurationMs`).
 * - Call {@link HttpLiveAggregator.close} to stop timers; with `flush=true` it performs a best‑effort final flush.
 */
export interface HttpLiveAggregator<_T> {
  push(frame: AggregatorFrame): void;
  forceFlush(): void;
  close(flush?: boolean): void;
  readonly inFlight: number;
}

/**
 * Create an HTTP live aggregator for chunking and sending PCM audio to HTTP‑only providers.
 *
 * Features:
 * - Timer‑based flush with minimum duration threshold
 * - Overlap tail prepended to the next chunk for continuity
 * - In‑flight request limiting (`maxInFlight`)
 * - Per‑flush timeout via `AbortController`
 * - Error propagation through `onError` and structured logging
 *
 * Example:
 * ```ts
 * const agg = createHttpLiveAggregator({
 *   intervalMs: 3000,
 *   minDurationMs: 700,
 *   overlapMs: 500,
 *   onFlush: async ({ pcm, sampleRate, channels, signal }) => {
 *     return await transcribeChunk(pcm, sampleRate, channels, { signal });
 *   },
 *   onResult: (r) => console.log('partial/final', r),
 * });
 * recorder.subscribeFrames(f => agg.push({ pcm: f.pcm, sampleRate: f.sampleRate, channels: f.channels }));
 * ```
 */
export function createHttpLiveAggregator<T>(opts: HttpLiveAggregatorOptions<T>): HttpLiveAggregator<T> {
  const intervalMs = opts.intervalMs ?? 3000;
  const minDurationMs = opts.minDurationMs ?? 700;
  const overlapMs = opts.overlapMs ?? 500;
  const logger = opts.logger;
  let maxInFlight = opts.maxInFlight ?? 1;
  if (maxInFlight < 1) {
    logger?.warn('http-live maxInFlight clamped to 1', {
      module: 'utils',
      event: 'http.config.warn',
      provided: opts.maxInFlight,
    });
    maxInFlight = 1;
  }
  const timeoutMs = opts.timeoutMs ?? 10_000;

  let timer: ReturnType<typeof setInterval> | null = null;
  let frames: AggregatorFrame[] = [];
  let accumulatedSamples = 0;
  let lastSampleRate: number | null = null;
  let lastChannels: 1 | 2 | null = null;
  let tail: Int16Array | null = null; // overlap tail from previous flush
  let inFlight = 0;
  let closed = false;

  const getDurationMs = (samples: number, sampleRate: number, channels: number): number =>
    (samples / (sampleRate * channels)) * 1000;

  const ensureTimer = (): void => {
    if (timer || closed || intervalMs <= 0) return;
    timer = setInterval(() => {
      if (
        !closed &&
        accumulatedSamples > 0 &&
        lastSampleRate !== null &&
        lastChannels !== null &&
        getDurationMs(accumulatedSamples, lastSampleRate, lastChannels) >= minDurationMs &&
        inFlight < maxInFlight
      ) {
        void flushInternal(false);
      }
    }, intervalMs);
  };

  const takeAudio = (): { pcm: Int16Array; sampleRate: number; channels: 1 | 2 } | null => {
    if (frames.length === 0 || lastSampleRate === null || lastChannels === null) return null;
    const total = accumulatedSamples;
    const overlapSamples = Math.max(0, Math.floor((overlapMs / 1000) * lastSampleRate * lastChannels));
    const head = tail && overlapSamples > 0 ? tail.subarray(Math.max(0, tail.length - overlapSamples)) : null;
    const result = new Int16Array((head ? head.length : 0) + total);
    let offset = 0;
    if (head) {
      result.set(head, 0);
      offset = head.length;
    }
    for (const f of frames) {
      result.set(f.pcm, offset);
      offset += f.pcm.length;
    }
    // compute new tail from end of result
    if (overlapSamples > 0) {
      const tlen = Math.min(result.length, overlapSamples);
      tail = result.subarray(result.length - tlen);
    } else {
      tail = null;
    }
    frames = [];
    accumulatedSamples = 0;
    return { pcm: result, sampleRate: lastSampleRate, channels: lastChannels };
  };

  const withTimeout = async <R>(fn: (signal: AbortSignal) => Promise<R>): Promise<R> => {
    const ctl = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      timeout = setTimeout(() => ctl.abort(), timeoutMs);
      return await fn(ctl.signal);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  let finalFlushPending = false;
  let pendingFlush = false;

  const flushInternal = async (forced: boolean, ignoreLimits = false, ignoreClosed = false): Promise<void> => {
    if (closed && !ignoreClosed) return;
    if (inFlight >= maxInFlight && !ignoreLimits) return;
    inFlight += 1;
    const chunk = takeAudio();
    if (!chunk) {
      inFlight -= 1;
      return;
    }
    logger?.debug('http-live flush', {
      module: 'utils',
      event: 'http.flush',
      forced,
      bytes: chunk.pcm.byteLength,
    });
    try {
      const result = await withTimeout((signal) => opts.onFlush({ ...chunk, signal }));
      opts.onResult?.(result);
    } catch (error) {
      logger?.error('http-live flush failed', {
        module: 'utils',
        event: 'http.flush.error',
        forced,
        error,
      });
      opts.onError?.(error);
    } finally {
      inFlight -= 1;
      // If a final flush was requested during an in-flight operation, perform it now ignoring limits/closed.
      if (finalFlushPending && frames.length > 0) {
        finalFlushPending = false;
        await flushInternal(true, true, true);
        // Clean up after final flush
        frames = [];
        accumulatedSamples = 0;
        tail = null;
      } else if (pendingFlush && frames.length > 0 && !closed && inFlight < maxInFlight) {
        // If there's a pending flush request and we're under the limit, execute it
        pendingFlush = false;
        void flushInternal(true);
      }
    }
  };

  const api: HttpLiveAggregator<T> = {
    push(frame: AggregatorFrame): void {
      if (closed) return;
      if (lastSampleRate === null) lastSampleRate = frame.sampleRate;
      if (lastChannels === null) lastChannels = frame.channels;
      // Normalize SR/channels expectation: if mismatch, start a new lane (simplest: ignore mismatched frames)
      if (frame.sampleRate !== lastSampleRate || frame.channels !== lastChannels) {
        logger?.warn('http-live dropped frame due to format mismatch', {
          module: 'utils',
          expected: { sampleRate: lastSampleRate, channels: lastChannels },
          received: { sampleRate: frame.sampleRate, channels: frame.channels },
        });
        return;
      }
      frames.push(frame);
      accumulatedSamples += frame.pcm.length;
      ensureTimer();
    },
    forceFlush(): void {
      if (frames.length === 0) return;
      if (inFlight >= maxInFlight) {
        pendingFlush = true;
      } else {
        void flushInternal(true);
      }
    },
    close(flush?: boolean): void {
      if (flush && frames.length > 0 && lastSampleRate !== null && lastChannels !== null) {
        if (inFlight >= maxInFlight) {
          // Defer final flush until the current one completes.
          finalFlushPending = true;
        } else {
          // flushInternal executes synchronously until the first await; it captures frames
          // before closed=true is set, so final flush will include current buffer.
          void flushInternal(true);
        }
      }
      closed = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (!finalFlushPending) {
        frames = [];
        accumulatedSamples = 0;
        tail = null;
      }
    },
    get inFlight() {
      return inFlight;
    },
  };

  return api;
}
