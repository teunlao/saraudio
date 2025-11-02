import { createBrowserRuntime } from '@saraudio/runtime-browser';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SaraudioProvider } from './context';
import { useRecorder } from './useRecorder';

describe('useRecorder', () => {
  it('creates recorder and disposes on unmount', () => {
    const runtime = createBrowserRuntime();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SaraudioProvider runtime={runtime}>{children}</SaraudioProvider>
    );

    const { result, unmount } = renderHook(() => useRecorder(), { wrapper });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.segments).toEqual([]);
    expect(result.current.vad).toBeNull();
    expect(result.current.levels).toEqual({ rms: 0, peak: 0, db: -Infinity });

    unmount();
  });

  it('does not recreate recorder when object reference changes but values are same', () => {
    const runtime = createBrowserRuntime();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SaraudioProvider runtime={runtime}>{children}</SaraudioProvider>
    );

    const { result, rerender } = renderHook(({ segmenter }) => useRecorder({ segmenter }), {
      wrapper,
      initialProps: { segmenter: { preRollMs: 300, hangoverMs: 500 } },
    });

    const firstPipeline = result.current.pipeline;

    rerender({ segmenter: { preRollMs: 300, hangoverMs: 500 } });

    expect(result.current.pipeline).toBe(firstPipeline);
  });

  it('recreates recorder when option values change', () => {
    const runtime = createBrowserRuntime();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SaraudioProvider runtime={runtime}>{children}</SaraudioProvider>
    );

    const { result, rerender } = renderHook(({ segmenter }) => useRecorder({ segmenter }), {
      wrapper,
      initialProps: { segmenter: { preRollMs: 300, hangoverMs: 500 } },
    });

    const firstPipeline = result.current.pipeline;

    rerender({ segmenter: { preRollMs: 500, hangoverMs: 500 } });

    expect(result.current.pipeline).not.toBe(firstPipeline);
  });
});
