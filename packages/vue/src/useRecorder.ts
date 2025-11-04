import type {
  Frame,
  NormalizedFrame,
  RecorderFormatOptions,
  Segment,
  StageController,
  SubscribeHandle,
  VADScore,
} from '@saraudio/core';
import type {
  BrowserRuntime,
  BrowserRuntimeOptions,
  Recorder,
  RecorderSourceOptions,
  RecorderStatus,
  RecorderUpdateOptions,
  RuntimeMode,
  SegmenterFactoryOptions,
} from '@saraudio/runtime-browser';
import { createRecorder } from '@saraudio/runtime-browser';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { onMounted, onUnmounted, ref, toValue, watch } from 'vue';

export interface UseRecorderResult {
  recorder: Ref<Recorder | null>;
  status: Ref<RecorderStatus>;
  error: Ref<Error | null>;
  segments: Ref<Segment[]>;
  vad: Ref<VADScore | null>;
  // Use runtime's pipeline type to avoid class identity mismatch across packages
  pipeline: Ref<Recorder['pipeline'] | null>;
  recordings: Ref<{
    cleaned: { getBlob: () => Promise<Blob | null>; durationMs: number };
    full: { getBlob: () => Promise<Blob | null>; durationMs: number };
    masked: { getBlob: () => Promise<Blob | null>; durationMs: number };
    meta: () => { sessionDurationMs: number; cleanedDurationMs: number };
    clear: () => void;
  }>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  clearSegments: () => void;
  subscribeFrames: (handler: (frame: NormalizedFrame<'pcm16'>) => void) => SubscribeHandle;
  subscribeRawFrames: (handler: (frame: Frame) => void) => SubscribeHandle;
  subscribeSpeechFrames: (handler: (frame: Frame) => void) => SubscribeHandle;
  onReady: (handler: () => void) => SubscribeHandle;
  update: (options?: RecorderUpdateOptions) => Promise<void>;
}

export interface UseRecorderOptions {
  runtime?: BrowserRuntime;
  runtimeOptions?: BrowserRuntimeOptions;
  stages?: MaybeRefOrGetter<StageController[] | undefined>;
  segmenter?: MaybeRefOrGetter<SegmenterFactoryOptions | StageController | false | undefined>;
  source?: MaybeRefOrGetter<RecorderSourceOptions | undefined>;
  format?: MaybeRefOrGetter<RecorderFormatOptions | undefined>;
  mode?: MaybeRefOrGetter<RuntimeMode | undefined>;
  allowFallback?: MaybeRefOrGetter<boolean | undefined>;
}

const cloneStages = (value: StageController[] | undefined): StageController[] | undefined => {
  if (!value) return undefined;
  return [...value];
};

export function useRecorder(options: UseRecorderOptions = {}): UseRecorderResult {
  const recorder = ref<Recorder | null>(null);
  const status = ref<RecorderStatus>('idle');
  const error = ref<Error | null>(null);
  const segments = ref<Segment[]>([]);
  const vad = ref<VADScore | null>(null);
  const pipeline = ref<Recorder['pipeline'] | null>(null);
  const recordings = ref({
    cleaned: { getBlob: async () => null as Blob | null, durationMs: 0 },
    full: { getBlob: async () => null as Blob | null, durationMs: 0 },
    masked: { getBlob: async () => null as Blob | null, durationMs: 0 },
    meta: () => ({ sessionDurationMs: 0, cleanedDurationMs: 0 }),
    clear: () => {},
  });

  const noopHandle: SubscribeHandle = () => {};

  const subscribeFrames = (handler: (frame: NormalizedFrame<'pcm16'>) => void): SubscribeHandle =>
    recorder.value ? recorder.value.subscribeFrames(handler) : noopHandle;

  const subscribeRawFrames = (handler: (frame: Frame) => void): SubscribeHandle =>
    recorder.value ? recorder.value.subscribeRawFrames(handler) : noopHandle;

  const subscribeSpeechFrames = (handler: (frame: Frame) => void): SubscribeHandle =>
    recorder.value ? recorder.value.subscribeSpeechFrames(handler) : noopHandle;

  const onReady = (handler: () => void): SubscribeHandle =>
    recorder.value ? recorder.value.onReady(handler) : noopHandle;

  const updateRecorder = async (next?: RecorderUpdateOptions): Promise<void> => {
    if (!recorder.value) return;
    await recorder.value.update(next);
  };

  const start = async () => {
    if (!recorder.value) return;
    try {
      status.value = 'acquiring';
      await recorder.value.start();
      status.value = 'running';
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
      status.value = 'error';
      throw e;
    }
  };

  const stop = async () => {
    if (!recorder.value) return;
    try {
      status.value = 'stopping';
      await recorder.value.stop();
      status.value = 'idle';
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
      status.value = 'error';
      throw e;
    }
  };

  const reset = () => {
    if (!recorder.value) return;
    recorder.value.reset();
    segments.value = [];
    vad.value = null;
    error.value = null;
    status.value = 'idle';
  };

  const clearSegments = () => {
    segments.value = [];
  };

  onMounted(() => {
    const fmt = options.format ? toValue(options.format) : undefined;
    const initialRecorder = createRecorder({
      runtime: options.runtime,
      runtimeOptions: options.runtimeOptions,
      stages: options.stages ? cloneStages(toValue(options.stages)) : undefined,
      segmenter: options.segmenter ? toValue(options.segmenter) : undefined,
      source: options.source ? toValue(options.source) : undefined,
      format: fmt,
      mode: toValue(options.mode ?? undefined),
      allowFallback: toValue(options.allowFallback ?? undefined),
    });

    recorder.value = initialRecorder;
    pipeline.value = initialRecorder.pipeline;
    recordings.value = initialRecorder.recordings;

    const vadUnsub = initialRecorder.onVad((v: VADScore) => {
      vad.value = v;
    });

    const segmentUnsub = initialRecorder.onSegment((s: Segment) => {
      segments.value = [...segments.value, s];
    });

    const errorUnsub = initialRecorder.onError((e) => {
      error.value = new Error(e.message);
    });

    const resolveStages = (): StageController[] | undefined => {
      if (options.stages === undefined) return undefined;
      const resolved = toValue(options.stages);
      if (resolved === undefined) return undefined;
      return cloneStages(resolved);
    };

    const resolveSegmenter = (): SegmenterFactoryOptions | StageController | false | undefined => {
      if (options.segmenter === undefined) return undefined;
      return toValue(options.segmenter);
    };

    const resolveSource = (): RecorderSourceOptions | undefined => {
      if (options.source === undefined) return undefined;
      return toValue(options.source);
    };

    const resolveFormat = (): RecorderFormatOptions | undefined => {
      if (options.format === undefined) return undefined;
      return toValue(options.format);
    };

    const resolveMode = (): RuntimeMode | undefined => {
      if (options.mode === undefined) return undefined;
      return toValue(options.mode);
    };

    const resolveAllowFallback = (): boolean | undefined => {
      if (options.allowFallback === undefined) return undefined;
      return toValue(options.allowFallback);
    };

    const stopUpdateWatch = watch(
      () => ({
        stages: resolveStages(),
        segmenter: resolveSegmenter(),
        source: resolveSource(),
        format: resolveFormat(),
        mode: resolveMode(),
        allowFallback: resolveAllowFallback(),
      }),
      async (nextOptions) => {
        await updateRecorder({
          stages: nextOptions.stages,
          segmenter: nextOptions.segmenter,
          source: nextOptions.source,
          format: nextOptions.format,
          mode: nextOptions.mode,
          allowFallback: nextOptions.allowFallback,
        });
      },
      { immediate: true },
    );

    onUnmounted(() => {
      vadUnsub();
      segmentUnsub();
      errorUnsub();
      stopUpdateWatch();
      initialRecorder.dispose();
    });
  });

  return {
    recorder,
    status,
    error,
    segments,
    vad,
    pipeline,
    recordings,
    start,
    stop,
    reset,
    clearSegments,
    subscribeFrames,
    subscribeRawFrames,
    subscribeSpeechFrames,
    onReady,
    update: updateRecorder,
  } as UseRecorderResult;
}
