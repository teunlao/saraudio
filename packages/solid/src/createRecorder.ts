import type { Pipeline, Segment, VADScore } from '@saraudio/core';
import type { Recorder, RecorderOptions, RecorderStatus } from '@saraudio/runtime-browser';
import { createRecorder as createBrowserRecorder } from '@saraudio/runtime-browser';
import { type Accessor, createSignal, onCleanup, onMount } from 'solid-js';

export interface SolidRecorderResult {
  readonly recorder: Accessor<Recorder | null>;
  readonly status: Accessor<RecorderStatus>;
  readonly error: Accessor<Error | null>;
  readonly segments: Accessor<Segment[]>;
  readonly vad: Accessor<VADScore | null>;
  readonly pipeline: Accessor<Pipeline | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  clearSegments: () => void;
}

export function createRecorder(options: RecorderOptions = {}): SolidRecorderResult {
  const [recorder, setRecorder] = createSignal<Recorder | null>(null);
  const [status, setStatus] = createSignal<RecorderStatus>('idle');
  const [error, setError] = createSignal<Error | null>(null);
  const [segments, setSegments] = createSignal<Segment[]>([]);
  const [vad, setVad] = createSignal<VADScore | null>(null);
  const [pipeline, setPipeline] = createSignal<Pipeline | null>(null);

  onMount(() => {
    const rec = createBrowserRecorder(options);
    setRecorder(rec);
    setPipeline(rec.pipeline);

    const vadUnsub = rec.onVad((v: VADScore) => {
      setVad(v);
    });

    const segmentUnsub = rec.onSegment((s: Segment) => {
      setSegments((prev) => [...prev, s]);
    });

    const errorUnsub = rec.onError((e) => {
      setError(new Error(e.message));
    });

    onCleanup(() => {
      vadUnsub();
      segmentUnsub();
      errorUnsub();
      rec.dispose();
    });
  });

  const start = async () => {
    const rec = recorder();
    if (!rec) return;
    try {
      setStatus('acquiring');
      await rec.start();
      setStatus('running');
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
      throw e;
    }
  };

  const stop = async () => {
    const rec = recorder();
    if (!rec) return;
    try {
      setStatus('stopping');
      await rec.stop();
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
      throw e;
    }
  };

  const reset = () => {
    const rec = recorder();
    if (!rec) return;
    rec.reset();
    setSegments([]);
    setVad(null);
    setError(null);
    setStatus('idle');
  };

  const clearSegments = () => {
    setSegments([]);
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
  };
}
