import type { Pipeline, Segment, VADScore } from '@saraudio/core';
import type { Recorder, RecorderOptions, RecorderStatus } from '@saraudio/runtime-browser';
import { createRecorder } from '@saraudio/runtime-browser';
import type { Ref } from 'vue';
import { onMounted, onUnmounted, ref } from 'vue';

export interface UseRecorderResult {
  recorder: Ref<Recorder | null>;
  status: Ref<RecorderStatus>;
  error: Ref<Error | null>;
  segments: Ref<Segment[]>;
  vad: Ref<VADScore | null>;
  pipeline: Ref<Pipeline | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  clearSegments: () => void;
}

export function useRecorder(options: RecorderOptions = {}): UseRecorderResult {
  const recorder = ref<Recorder | null>(null);
  const status = ref<RecorderStatus>('idle');
  const error = ref<Error | null>(null);
  const segments = ref<Segment[]>([]);
  const vad = ref<VADScore | null>(null);
  const pipeline = ref<Pipeline | null>(null);

  onMounted(() => {
    const rec = createRecorder(options);
    recorder.value = rec;
    pipeline.value = rec.pipeline;

    const vadUnsub = rec.onVad((v: VADScore) => {
      vad.value = v;
    });

    const segmentUnsub = rec.onSegment((s: Segment) => {
      segments.value = [...segments.value, s];
    });

    const errorUnsub = rec.onError((e) => {
      error.value = new Error(e.message);
    });

    onUnmounted(() => {
      vadUnsub.unsubscribe();
      segmentUnsub.unsubscribe();
      errorUnsub.unsubscribe();
      rec.dispose();
    });
  });

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

  return {
    recorder,
    status,
    error,
    segments,
    vad,
    pipeline,
    start,
    stop,
    reset,
    clearSegments,
  } as UseRecorderResult;
}
