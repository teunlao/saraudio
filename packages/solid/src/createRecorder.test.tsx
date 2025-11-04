import type { Segment, VADScore } from '@saraudio/core';
import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecorder } from './createRecorder';

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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', () => {
    const TestComponent = () => {
      const rec = createRecorder({});

      expect(rec.status()).toBe('idle');
      expect(rec.error()).toBe(null);
      expect(rec.segments()).toEqual([]);
      expect(rec.vad()).toBe(null);

      return null;
    };

    render(() => <TestComponent />);
  });

  it('updates status on start', async () => {
    const TestComponent = () => {
      const rec = createRecorder({});

      setTimeout(() => {
        rec.start().then(() => {
          expect(rec.status()).toBe('running');
        });
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('updates status on stop', async () => {
    const TestComponent = () => {
      const rec = createRecorder({});

      setTimeout(() => {
        rec
          .start()
          .then(() => rec.stop())
          .then(() => {
            expect(rec.status()).toBe('idle');
          });
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('handles errors during start', async () => {
    const TestComponent = () => {
      const rec = createRecorder({});

      setTimeout(() => {
        const recValue = rec.recorder();
        if (recValue) {
          vi.mocked(recValue.start).mockRejectedValueOnce(new Error('Test error'));

          rec.start().catch(() => {
            expect(rec.status()).toBe('error');
            expect(rec.error()?.message).toBe('Test error');
          });
        }
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('clears segments', () => {
    const TestComponent = () => {
      const rec = createRecorder({});

      setTimeout(() => {
        rec.clearSegments();
        expect(rec.segments()).toEqual([]);
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
  });

  it('resets recorder state', () => {
    const TestComponent = () => {
      const rec = createRecorder({});

      setTimeout(() => {
        rec.reset();
        expect(rec.segments()).toEqual([]);
        expect(rec.vad()).toBe(null);
        expect(rec.status()).toBe('idle');
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
  });
});
