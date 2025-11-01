import type { Pipeline } from '@saraudio/core';
import * as runtime from '@saraudio/runtime-browser';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRecorder } from './useRecorder';

describe('useRecorder (thin wrapper)', () => {
  it('creates recorder via runtime-browser and disposes on unmount', () => {
    const dispose = vi.fn();
    const fakeRecorder: runtime.Recorder = {
      status: 'idle',
      error: null,
      pipeline: {} as unknown as Pipeline,
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      dispose,
      onVad: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      onSegment: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      onError: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      subscribeRawFrames: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      subscribeSpeechFrames: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      recordings: {
        cleaned: { getBlob: vi.fn(), durationMs: 0 },
        full: { getBlob: vi.fn(), durationMs: 0 },
        masked: { getBlob: vi.fn(), durationMs: 0 },
        meta: () => ({ sessionDurationMs: 0, cleanedDurationMs: 0 }),
        clear: vi.fn(),
      },
    };

    const spy = vi.spyOn(runtime, 'createRecorder').mockReturnValue(fakeRecorder);

    const { unmount, result } = renderHook(() => useRecorder());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(fakeRecorder);

    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
