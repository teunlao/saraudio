import type { Segment, Stage, StageController, VADScore } from '@saraudio/core';
import type {
  MicrophoneSourceOptions,
  RecorderSourceOptions,
  RuntimeMode,
  SegmenterFactoryOptions,
} from '@saraudio/runtime-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { withSetup } from './test-utils/withSetup';
import { useRecorder } from './useRecorder';

const updateMock = vi.fn(async () => {});
const startMock = vi.fn(async () => {});
const stopMock = vi.fn(async () => {});

vi.mock('@saraudio/runtime-browser', () => ({
  createRecorder: vi.fn(() => {
    const vadHandlers = new Set<(v: VADScore) => void>();
    const segmentHandlers = new Set<(s: Segment) => void>();
    const errorHandlers = new Set<(e: { message: string }) => void>();

    return {
      status: 'idle' as const,
      error: null,
      pipeline: {
        events: {
          on: vi.fn(),
          emit: vi.fn(),
        },
        push: vi.fn(),
        flush: vi.fn(),
        dispose: vi.fn(),
      },
      configure: vi.fn(),
      update: updateMock,
      start: startMock,
      stop: stopMock,
      reset: vi.fn(),
      dispose: vi.fn(),
      onVad: (handler: (v: VADScore) => void) => {
        vadHandlers.add(handler);
        return () => {
          vadHandlers.delete(handler);
        };
      },
      onSegment: (handler: (s: Segment) => void) => {
        segmentHandlers.add(handler);
        return () => {
          segmentHandlers.delete(handler);
        };
      },
      onError: (handler: (e: { message: string }) => void) => {
        errorHandlers.add(handler);
        return () => {
          errorHandlers.delete(handler);
        };
      },
    };
  }),
}));

describe('useRecorder', () => {
  let apps: ReturnType<typeof withSetup>[1][] = [];

  afterEach(() => {
    for (const app of apps) {
      app.unmount();
    }
    apps = [];
    updateMock.mockReset();
    startMock.mockReset();
    stopMock.mockReset();
  });

  it('initializes with default state', () => {
    const [rec, app] = withSetup(() => useRecorder());
    apps.push(app);

    expect(rec.status.value).toBe('idle');
    expect(rec.error.value).toBe(null);
    expect(rec.segments.value).toEqual([]);
    expect(rec.vad.value).toBe(null);
  });

  it('updates status on start', async () => {
    const [rec, app] = withSetup(() => useRecorder());
    apps.push(app);

    await rec.start();

    expect(rec.status.value).toBe('running');
  });

  it('updates status on stop', async () => {
    const [rec, app] = withSetup(() => useRecorder());
    apps.push(app);

    await rec.start();
    await rec.stop();

    expect(rec.status.value).toBe('idle');
  });

  it('handles errors during start', async () => {
    const [rec, app] = withSetup(() => useRecorder());
    apps.push(app);

    // Mock start to throw error
    if (rec.recorder.value) {
      vi.mocked(rec.recorder.value.start).mockRejectedValueOnce(new Error('Test error'));
    }

    await expect(rec.start()).rejects.toThrow('Test error');
    expect(rec.status.value).toBe('error');
    expect(rec.error.value?.message).toBe('Test error');
  });

  it('clears segments', () => {
    const [rec, app] = withSetup(() => useRecorder());
    apps.push(app);

    // Manually add segments
    rec.segments.value = [
      { id: '1', pcm: new Int16Array(), startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 },
    ];

    rec.clearSegments();

    expect(rec.segments.value).toEqual([]);
  });

  it('resets recorder state', () => {
    const [rec, app] = withSetup(() => useRecorder());
    apps.push(app);

    rec.segments.value = [
      { id: '1', pcm: new Int16Array(), startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 },
    ];
    rec.vad.value = { score: 1, speech: true, tsMs: 100 };
    rec.error.value = new Error('Test error');

    rec.reset();

    expect(rec.status.value).toBe('idle');
    expect(rec.error.value).toBe(null);
    expect(rec.segments.value).toEqual([]);
    expect(rec.vad.value).toBe(null);
  });

  it('reconfigures when stages change via ref', async () => {
    const controller: StageController = {
      id: 'test',
      create: () =>
        ({
          name: 'test',
          setup: () => {},
          handle: () => {},
        }) satisfies Stage,
    };
    const stages = ref([controller]);

    const [_rec, app] = withSetup(() => useRecorder({ stages }));
    apps.push(app);

    await nextTick();
    await Promise.resolve();
    updateMock.mockClear();

    stages.value = [controller, controller];
    await nextTick();
    await Promise.resolve();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stages: [controller, controller],
        segmenter: undefined,
      }),
    );
  });

  it('reconfigures when segmenter toggles', async () => {
    const segmenter = ref<SegmenterFactoryOptions | false>(false);

    const [_rec, app] = withSetup(() => useRecorder({ segmenter }));
    apps.push(app);

    await nextTick();
    await Promise.resolve();
    updateMock.mockClear();

    segmenter.value = { preRollMs: 200 };
    await nextTick();
    await Promise.resolve();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stages: undefined,
        segmenter: { preRollMs: 200 },
      }),
    );
  });

  it('updates constraints when capture options change', async () => {
    const constraints = ref<MicrophoneSourceOptions['constraints'] | undefined>(undefined);

    const [_rec, app] = withSetup(() => useRecorder({ constraints }));
    apps.push(app);

    await nextTick();
    await Promise.resolve();
    updateMock.mockClear();

    constraints.value = { channelCount: 1 };
    await nextTick();
    await Promise.resolve();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: { channelCount: 1 },
      }),
    );
  });

  it('updates source when microphone changes', async () => {
    const source = ref<RecorderSourceOptions | undefined>({ microphone: { deviceId: 'mic-1' } });

    const [_rec, app] = withSetup(() => useRecorder({ source }));
    apps.push(app);

    await nextTick();
    await Promise.resolve();
    updateMock.mockClear();

    source.value = { microphone: { deviceId: 'mic-2' } };
    await nextTick();
    await Promise.resolve();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { microphone: { deviceId: 'mic-2' } },
      }),
    );
  });

  it('updates mode when runtime mode changes', async () => {
    const mode = ref<RuntimeMode | undefined>('auto');

    const [_rec, app] = withSetup(() => useRecorder({ mode }));
    apps.push(app);

    await nextTick();
    await Promise.resolve();
    updateMock.mockClear();

    mode.value = 'media-recorder';
    await nextTick();
    await Promise.resolve();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'media-recorder',
      }),
    );
  });

  it('updates allowFallback when toggled', async () => {
    const allowFallback = ref<boolean | undefined>(true);

    const [_rec, app] = withSetup(() => useRecorder({ allowFallback }));
    apps.push(app);

    await nextTick();
    await Promise.resolve();
    updateMock.mockClear();

    allowFallback.value = false;
    await nextTick();
    await Promise.resolve();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowFallback: false,
      }),
    );
  });
});
