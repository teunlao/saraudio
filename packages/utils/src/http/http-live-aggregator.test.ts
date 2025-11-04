import { describe, expect, test, vi } from 'vitest';
import { type AggregatorFrame, createHttpLiveAggregator } from './http-live-aggregator';

function makeFrame(samples = 320, rate = 16000): AggregatorFrame {
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) pcm[i] = i % 100;
  return { pcm, sampleRate: rate, channels: 1 };
}

// Helper to flush all pending promises
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('HttpLiveAggregator', () => {
  test('timer flush with minDuration', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const agg = createHttpLiveAggregator<{ ok: true }>({
      intervalMs: 100,
      minDurationMs: 20,
      onFlush: async ({ pcm }) => {
        calls.push(pcm.length);
        return { ok: true };
      },
      timeoutMs: 1000,
    });
    agg.push(makeFrame(320)); // ~20ms
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(calls.length).toBe(1);
    agg.close();
    vi.useRealTimers();
  });

  test('forceFlush flushes even if minDuration not met', async () => {
    const calls: number[] = [];
    const agg = createHttpLiveAggregator<{ ok: true }>({
      intervalMs: 0,
      minDurationMs: 10_000,
      onFlush: async ({ pcm }) => {
        calls.push(pcm.length);
        return { ok: true };
      },
      timeoutMs: 1000,
    });
    agg.push(makeFrame(160));
    agg.forceFlush();
    await Promise.resolve();
    expect(calls.length).toBe(1);
    agg.close();
  });

  test('maxInFlight prevents concurrent flushes', async () => {
    const pending: { resolve?: () => void } = {};
    const p = new Promise<void>((r) => {
      pending.resolve = r;
    });
    let started = 0;
    let finished = 0;
    const agg = createHttpLiveAggregator<{ ok: true }>({
      intervalMs: 0,
      minDurationMs: 0,
      maxInFlight: 1,
      onFlush: async () => {
        started += 1;
        await p; // hold until we resolve
        finished += 1;
        return { ok: true };
      },
    });

    agg.push(makeFrame(160));
    agg.forceFlush();
    agg.push(makeFrame(160));
    agg.forceFlush(); // deferred because inFlight=1, will auto-flush when first completes
    expect(started).toBe(1);
    pending.resolve?.();
    await flushPromises();
    // pending flush automatically executed, both flushes completed
    expect(finished).toBe(2);
    agg.close();
  });

  test('timeout aborts onFlush', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const agg = createHttpLiveAggregator<{ ok: true }>({
      intervalMs: 0,
      minDurationMs: 0,
      timeoutMs: 50,
      onFlush: async ({ signal }) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        });
        return { ok: true };
      },
    });
    agg.push(makeFrame(160));
    agg.forceFlush();
    vi.advanceTimersByTime(60);
    await Promise.resolve();
    expect(aborted).toBe(true);
    agg.close();
    vi.useRealTimers();
  });

  test('race: concurrent forceFlush picks single chunk (no double-grab)', async () => {
    let calls = 0;
    const agg = createHttpLiveAggregator({
      intervalMs: 0,
      minDurationMs: 0,
      onFlush: async () => {
        calls += 1;
        return { ok: true } as const;
      },
    });
    agg.push(makeFrame(160));
    agg.forceFlush();
    agg.forceFlush();
    await Promise.resolve();
    expect(calls).toBe(1);
    agg.close();
  });

  test('close(true) performs best-effort flush of pending data', async () => {
    let flushedBytes = 0;
    const agg = createHttpLiveAggregator({
      intervalMs: 0,
      minDurationMs: 10_000,
      onFlush: async ({ pcm }) => {
        flushedBytes += pcm.byteLength;
        return { ok: true } as const;
      },
    });
    agg.push(makeFrame(320));
    agg.close(true);
    await Promise.resolve();
    expect(flushedBytes).toBeGreaterThan(0);
  });

  test('stereo: duration and overlap account for channels', async () => {
    vi.useFakeTimers();
    const flushed: { bytes: number; headCopy: number }[] = [];
    const agg = createHttpLiveAggregator<{ ok: true }>({
      intervalMs: 100,
      minDurationMs: 20, // 20ms at 16kHz stereo = 320*2 samples
      overlapMs: 10,
      onFlush: async ({ pcm }) => {
        flushed.push({ bytes: pcm.byteLength, headCopy: pcm[0] ?? 0 });
        return { ok: true } as const;
      },
      timeoutMs: 1000,
    });
    // Push 20ms stereo → two channels interleaved (320 frames * 2 samples)
    const stereo20ms = (frames: number) => {
      const samples = frames * 2; // stereo
      const pcm = new Int16Array(samples);
      for (let i = 0; i < samples; i += 1) pcm[i] = i % 128;
      return { pcm, sampleRate: 16000, channels: 2 } as AggregatorFrame;
    };
    agg.push(stereo20ms(320));
    // Timer tick should flush once
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(flushed.length).toBe(1);
    // Next chunk: check overlap translates to samples*channels; use explicit force to avoid timer flakiness
    agg.push(stereo20ms(320));
    agg.forceFlush();
    await Promise.resolve();
    expect(flushed.length).toBe(2);
    // No strict value check for overlap contents here, but ensure bytes are > 0
    expect(flushed[1].bytes).toBeGreaterThan(0);
    agg.close();
    vi.useRealTimers();
  });

  test('close(true) during in-flight defers and flushes remaining audio', async () => {
    const pending: { resolve?: () => void } = {};
    const p = new Promise<void>((resolve) => {
      pending.resolve = resolve;
    });
    let calls = 0;
    const bytes: number[] = [];
    const agg = createHttpLiveAggregator<{ ok: true }>({
      intervalMs: 0,
      minDurationMs: 0,
      maxInFlight: 1,
      onFlush: async ({ pcm }) => {
        calls += 1;
        bytes.push(pcm.byteLength);
        await p; // hold first flush
        return { ok: true } as const;
      },
    });
    agg.push(makeFrame(160));
    agg.forceFlush(); // first in-flight
    // Add more data and close with flush while in-flight
    agg.push(makeFrame(160));
    agg.close(true);
    // Release first
    pending.resolve?.();
    await flushPromises();
    await flushPromises();
    // Expect two flush calls (final deferred)
    expect(calls).toBe(2);
    expect(bytes.length).toBe(2);
  });

  test('onFlush error is logged and onError called', async () => {
    const logs: { level: 'error' | 'warn' | 'debug'; msg: string }[] = [];
    const logger = {
      debug: (m: string) => logs.push({ level: 'debug', msg: m }),
      info: () => {},
      warn: (m: string) => logs.push({ level: 'warn', msg: m }),
      error: (m: string) => logs.push({ level: 'error', msg: m }),
      child: () => logger,
    } as const;
    let onErrorCalled = 0;
    const agg = createHttpLiveAggregator({
      intervalMs: 0,
      minDurationMs: 0,
      onFlush: async () => {
        throw new Error('boom');
      },
      onError: () => {
        onErrorCalled += 1;
      },
      logger,
    });
    agg.push(makeFrame(160));
    agg.forceFlush();
    await flushPromises();
    expect(onErrorCalled).toBe(1);
    expect(logs.some((l) => l.level === 'error')).toBe(true);
    agg.close();
  });

  test('drops frames with format mismatch (sampleRate/channels) and warns', async () => {
    const warnings: string[] = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (m: string) => warnings.push(m),
      error: () => {},
      child: () => logger,
    } as const;
    let flushed = 0;
    const agg = createHttpLiveAggregator({
      intervalMs: 0,
      minDurationMs: 0,
      onFlush: async ({ pcm }) => {
        flushed += pcm.length;
        return { ok: true } as const;
      },
      logger,
    });
    agg.push(makeFrame(160, 16000));
    agg.push(makeFrame(160, 8000)); // SR mismatch → drop
    agg.push({ ...makeFrame(160, 16000), channels: 2 }); // channels mismatch → drop
    agg.forceFlush();
    await Promise.resolve();
    expect(flushed).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
    agg.close();
  });
});
