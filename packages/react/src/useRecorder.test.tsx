import type { CoreError, Segment, StageController } from '@saraudio/core';
import { createRecorderStub } from '@saraudio/core/testing';
import type { BrowserRuntime, RuntimeMode } from '@saraudio/runtime-browser';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SaraudioProvider } from './context';
import { useRecorder } from './useRecorder';

interface UpdateArgsSnapshot {
  stages?: StageController[];
  segmenter?: unknown;
  mode?: RuntimeMode;
  allowFallback?: boolean;
}

const mocks = vi.hoisted(() => {
  const updateMock = vi.fn(async () => {});
  const startMock = vi.fn(async () => {});
  const stopMock = vi.fn(async () => {});
  const disposeMock = vi.fn();

  // SHARED handlers across all stubs (for StrictMode compatibility)
  const vadHandlers = new Set<(payload: { score: number; speech: boolean; tsMs: number }) => void>();
  const segmentHandlers = new Set<(segment: Segment) => void>();
  const errorHandlers = new Set<(error: CoreError) => void>();

  const createRecorderMock = vi.fn(() => {
    const stub = createRecorderStub();
    stub.update = updateMock;
    stub.start = startMock;
    stub.stop = stopMock;
    stub.dispose = disposeMock;

    // Override to use SHARED handlers
    stub.onVad = (handler: (payload: { score: number; speech: boolean; tsMs: number }) => void) => {
      vadHandlers.add(handler);
      return () => vadHandlers.delete(handler);
    };
    stub.onSegment = (handler: (segment: Segment) => void) => {
      segmentHandlers.add(handler);
      return () => segmentHandlers.delete(handler);
    };
    stub.onError = (handler: (error: CoreError) => void) => {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    };

    return stub;
  });

  const emitVad = (payload: { score: number; speech: boolean }) => {
    vadHandlers.forEach((h) => h({ ...payload, tsMs: Date.now() }));
  };

  return {
    createRecorderMock,
    updateMock,
    startMock,
    stopMock,
    disposeMock,
    emitVad,
  } as const;
});

vi.mock('@saraudio/runtime-browser', async () => {
  const actual = await vi.importActual<typeof import('@saraudio/runtime-browser')>('@saraudio/runtime-browser');
  return {
    ...actual,
    createRecorder: mocks.createRecorderMock,
  };
});

const runtimeStub = { id: 'runtime-stub' } as unknown as BrowserRuntime;

const BaseWrapper = ({ children }: { children: ReactNode }) => (
  <SaraudioProvider runtime={runtimeStub}>{children}</SaraudioProvider>
);

const StrictWrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <SaraudioProvider runtime={runtimeStub}>{children}</SaraudioProvider>
  </StrictMode>
);

const lastUpdateArgs = (): UpdateArgsSnapshot | null => {
  const { calls } = mocks.updateMock.mock;
  if (calls.length === 0) return null;
  const entry = calls[calls.length - 1] as unknown[] | undefined;
  if (!entry || entry.length === 0) return null;
  return entry[0] as UpdateArgsSnapshot;
};

describe('useRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a recorder and disposes it on unmount', async () => {
    const { unmount } = renderHook(() => useRecorder(), { wrapper: BaseWrapper });

    await waitFor(() => expect(mocks.createRecorderMock).toHaveBeenCalled());
    const created = mocks.createRecorderMock.mock.calls.length;
    expect(created).toBeGreaterThan(0);

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.disposeMock.mock.calls.length).toBeGreaterThanOrEqual(created);
  });

  it('updates stage configuration without recreating recorder', async () => {
    const { rerender } = renderHook(
      ({ threshold }) =>
        useRecorder({
          stages: [
            {
              id: 'stage',
              key: String(threshold),
              create: () => ({ name: 'stage', setup: () => {}, handle: () => {} }),
            } as StageController,
          ],
        }),
      { wrapper: BaseWrapper, initialProps: { threshold: -55 } },
    );

    await waitFor(() => expect(mocks.createRecorderMock).toHaveBeenCalledTimes(1));
    const baselineUpdate = mocks.updateMock.mock.calls.length;

    rerender({ threshold: -40 });

    await waitFor(() => expect(mocks.updateMock.mock.calls.length).toBeGreaterThan(baselineUpdate));
    const stageArgs = lastUpdateArgs();
    expect(stageArgs?.stages).toBeDefined();
    expect(mocks.createRecorderMock).toHaveBeenCalledTimes(1);
  });

  it('reuses recorder when stage configuration is referentially stable', async () => {
    const stage: StageController = {
      id: 'stable',
      key: '1',
      create: () => ({ name: 'stable', setup: () => {}, handle: () => {} }),
    } as StageController;

    const { rerender } = renderHook(() => useRecorder({ stages: [stage] }), {
      wrapper: BaseWrapper,
    });

    await waitFor(() => expect(mocks.createRecorderMock).toHaveBeenCalledTimes(1));
    const baselineUpdate = mocks.updateMock.mock.calls.length;

    rerender();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.updateMock.mock.calls.length).toBe(baselineUpdate);
    expect(mocks.createRecorderMock).toHaveBeenCalledTimes(1);
  });

  it('updates capture options without recreating recorder', async () => {
    const { rerender } = renderHook(
      ({ mode }) =>
        useRecorder({
          mode,
        }),
      {
        wrapper: BaseWrapper,
        initialProps: { mode: 'auto' as RuntimeMode },
      },
    );

    expect(mocks.updateMock).not.toHaveBeenCalled();

    rerender({ mode: 'audio-context' });

    await waitFor(() => expect(mocks.updateMock).toHaveBeenCalledTimes(1));
    const captureArgs = lastUpdateArgs();
    expect(captureArgs?.mode).toBe('audio-context');
    expect(mocks.createRecorderMock).toHaveBeenCalledTimes(1);
  });

  it('recreates recorder when runtime override changes', async () => {
    const runtimeA = { id: 'A' } as unknown as BrowserRuntime;
    const runtimeB = { id: 'B' } as unknown as BrowserRuntime;

    const { rerender } = renderHook(({ runtime }) => useRecorder({ runtime }), {
      wrapper: BaseWrapper,
      initialProps: { runtime: runtimeA },
    });

    await waitFor(() => expect(mocks.createRecorderMock).toHaveBeenCalled());
    const baseline = mocks.createRecorderMock.mock.calls.length;

    rerender({ runtime: runtimeB });

    await waitFor(() => expect(mocks.createRecorderMock.mock.calls.length).toBeGreaterThan(baseline));
    expect(mocks.disposeMock).toHaveBeenCalled();
  });

  it('delivers VAD events after React StrictMode double mounting', async () => {
    const { result } = renderHook(() => useRecorder(), { wrapper: StrictWrapper });

    await waitFor(() => expect(mocks.createRecorderMock).toHaveBeenCalled());
    mocks.emitVad({ score: 0.6, speech: true });

    await waitFor(() => expect(result.current.vad).toEqual({ isSpeech: true, score: 0.6 }));
  });

  it('autoStart triggers start even with StrictMode double render without leaks', async () => {
    const { unmount } = renderHook(() => useRecorder({ autoStart: true }), { wrapper: StrictWrapper });

    await waitFor(() => expect(mocks.startMock).toHaveBeenCalled());

    unmount();
    expect(mocks.stopMock.mock.calls.length).toBeLessThanOrEqual(mocks.startMock.mock.calls.length);
  });
});
