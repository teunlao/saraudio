import { createRecorderStub } from '@saraudio/core/testing';
import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecorder } from './createRecorder';

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
