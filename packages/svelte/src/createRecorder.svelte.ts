import type { Pipeline, Segment, VADScore } from '@saraudio/core';
import type { Recorder, RecorderOptions, RecorderStatus } from '@saraudio/runtime-browser';
import { createRecorder as createBrowserRecorder } from '@saraudio/runtime-browser';

export interface SvelteRecorderResult {
  readonly recorder: Recorder;
  readonly status: RecorderStatus;
  readonly error: Error | null;
  readonly segments: Segment[];
  readonly vad: VADScore | null;
  readonly pipeline: Pipeline;
  readonly recordings: {
    cleaned: { getBlob: () => Promise<Blob | null>; durationMs: number };
    full: { getBlob: () => Promise<Blob | null>; durationMs: number };
    masked: { getBlob: () => Promise<Blob | null>; durationMs: number };
    meta: () => { sessionDurationMs: number; cleanedDurationMs: number };
    clear: () => void;
  };
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
  clearSegments(): void;
}

export function createRecorder(options: RecorderOptions): SvelteRecorderResult {
  // Create recorder synchronously
  const recorder = createBrowserRecorder(options);

  let status = $state<RecorderStatus>('idle');
  let error = $state<Error | null>(null);
  let segments = $state<Segment[]>([]);
  let vad = $state<VADScore | null>(null);

  // Subscribe to events
  const vadUnsub = recorder.onVad((v) => {
    vad = v;
  });

  const segmentUnsub = recorder.onSegment((s) => {
    segments = [...segments, s];
  });

  const errorUnsub = recorder.onError((e) => {
    error = new Error(e.message);
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      vadUnsub();
      segmentUnsub();
      errorUnsub();
      recorder.dispose();
    };
  });

  return {
    get recorder() {
      return recorder;
    },
    get status() {
      return status;
    },
    get error() {
      return recorder.error ?? error;
    },
    get segments() {
      return segments;
    },
    get vad() {
      return vad;
    },
    get pipeline() {
      return recorder.pipeline;
    },
    get recordings() {
      return recorder.recordings;
    },

    start: async () => {
      try {
        status = 'acquiring';
        await recorder.start();
        status = 'running';
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        status = 'error';
        throw e;
      }
    },

    stop: async () => {
      try {
        status = 'stopping';
        await recorder.stop();
        status = 'idle';
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        status = 'error';
        throw e;
      }
    },

    reset: () => {
      recorder.reset();
      segments = [];
      vad = null;
      error = null;
      status = 'idle';
    },

    clearSegments: () => {
      segments = [];
    },
  };
}
