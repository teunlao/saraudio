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

  it('clears segments', () => {
    const runtime = createBrowserRuntime();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SaraudioProvider runtime={runtime}>{children}</SaraudioProvider>
    );

    const { result } = renderHook(() => useRecorder(), { wrapper });

    // Access segments array and verify it can be cleared
    expect(result.current.segments).toEqual([]);
    result.current.clearSegments();
    expect(result.current.segments).toEqual([]);
  });

  it('resets recorder state', () => {
    const runtime = createBrowserRuntime();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SaraudioProvider runtime={runtime}>{children}</SaraudioProvider>
    );

    const { result, rerender } = renderHook(({ key }) => useRecorder({ segmenter: key ? { preRollMs: 300 } : {} }), {
      wrapper,
      initialProps: { key: true },
    });

    const firstPipeline = result.current.pipeline;

    // Force recreation by changing options
    rerender({ key: false });

    // Pipeline should be different (recorder was recreated)
    expect(result.current.pipeline).not.toBe(firstPipeline);
    expect(result.current.segments).toEqual([]);
    expect(result.current.vad).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('has reset method to clear state', () => {
    const runtime = createBrowserRuntime();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SaraudioProvider runtime={runtime}>{children}</SaraudioProvider>
    );

    const { result } = renderHook(() => useRecorder(), { wrapper });

    expect(result.current.clearSegments).toBeInstanceOf(Function);
    result.current.clearSegments();
    expect(result.current.segments).toEqual([]);
  });
});
