import { createRecorderStub } from '@saraudio/core/testing';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecorder } from './createRecorder.svelte';

vi.mock('@saraudio/runtime-browser', () => ({
  createRecorder: () => {
    const stub = createRecorderStub();
    // Wrap methods with vi.fn() for mocking capabilities
    stub.start = vi.fn(stub.start);
    stub.stop = vi.fn(stub.stop);
    stub.reset = vi.fn(stub.reset);
    stub.dispose = vi.fn(stub.dispose);
    return stub;
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
