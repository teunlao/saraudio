import type { Segment, VADScore } from '@saraudio/core';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecorder } from './createRecorder.svelte';

// Mock createRecorder
vi.mock('@saraudio/runtime-browser', () => ({
  createRecorder: () => {
    const vadHandlers = new Set<(v: VADScore) => void>();
    const segmentHandlers = new Set<(s: Segment) => void>();
    const errorHandlers = new Set<(e: { message: string }) => void>();

    return {
      status: 'idle',
      error: null,
      pipeline: {
        events: {
          on: vi.fn(),
          emit: vi.fn(),
        },
        push: vi.fn(),
        flush: vi.fn(),
        dispose: vi.fn(),
        configure: vi.fn(),
      },
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      reset: vi.fn(),
      dispose: vi.fn(),
      onVad: (handler: (v: VADScore) => void) => {
        vadHandlers.add(handler);
        return () => vadHandlers.delete(handler);
      },
      onSegment: (handler: (s: Segment) => void) => {
        segmentHandlers.add(handler);
        return () => segmentHandlers.delete(handler);
      },
      onError: (handler: (e: { message: string }) => void) => {
        errorHandlers.add(handler);
        return () => errorHandlers.delete(handler);
      },
    };
  },
}));

describe('createRecorder', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('initializes with default state', () => {
    cleanup = $effect.root(() => {
      const rec = createRecorder({});

      expect(rec.status).toBe('idle');
      expect(rec.error).toBe(null);
      expect(rec.segments).toEqual([]);
      expect(rec.vad).toBe(null);
    });
  });

  it('updates status on start', async () => {
    cleanup = $effect.root(() => {
      const rec = createRecorder({});

      rec.start().then(() => {
        flushSync();
        expect(rec.status).toBe('running');
      });
    });
  });

  it('updates status on stop', async () => {
    cleanup = $effect.root(() => {
      const rec = createRecorder({});

      rec
        .start()
        .then(() => rec.stop())
        .then(() => {
          flushSync();
          expect(rec.status).toBe('idle');
        });
    });
  });

  it('handles errors during start', async () => {
    cleanup = $effect.root(() => {
      const rec = createRecorder({});

      vi.mocked(rec.recorder.start).mockRejectedValueOnce(new Error('Test error'));

      rec.start().catch(() => {
        flushSync();
        expect(rec.status).toBe('error');
        expect(rec.error?.message).toBe('Test error');
      });
    });
  });

  it('clears segments', () => {
    cleanup = $effect.root(() => {
      const rec = createRecorder({});

      rec.segments.push({
        id: '1',
        pcm: new Int16Array(),
        startMs: 0,
        endMs: 100,
        durationMs: 100,
        sampleRate: 16000,
        channels: 1,
      });

      rec.clearSegments();
      flushSync();

      expect(rec.segments).toEqual([]);
    });
  });

  it('resets recorder state', () => {
    cleanup = $effect.root(() => {
      const rec = createRecorder({});

      rec.segments.push({
        id: '1',
        pcm: new Int16Array(),
        startMs: 0,
        endMs: 100,
        durationMs: 100,
        sampleRate: 16000,
        channels: 1,
      });

      rec.reset();
      flushSync();

      expect(rec.segments).toEqual([]);
      expect(rec.vad).toBe(null);
      expect(rec.status).toBe('idle');
    });
  });
});
