import type { Pipeline, Segment } from '@saraudio/core';
import type { BrowserRuntime, MicrophoneSourceOptions, RuntimeMode } from '@saraudio/runtime-browser';
import { createRecorder } from '@saraudio/runtime-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSaraudioFallbackReason, useSaraudioRuntime } from './context';
import { toError } from './internal/errorUtils';
import { useDeepCompareEffect } from './internal/useDeepCompareEffect';
import { useShallowStable } from './internal/useShallowStable';
import { type StageInput, useStableLoaders } from './internal/useStableLoaders';
import { useMeter } from './useMeter';

export interface UseRecorderOptions {
  stages?: StageInput[];
  segmenter?: { preRollMs?: number; hangoverMs?: number } | false;
  constraints?: MicrophoneSourceOptions['constraints'];
  mode?: RuntimeMode;
  runtime?: BrowserRuntime;
  autoStart?: boolean;
  allowFallback?: boolean;
}

export interface UseRecorderResult {
  status: 'idle' | 'acquiring' | 'running' | 'stopping' | 'error';
  error: Error | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  vad: { isSpeech: boolean; score: number } | null;
  levels: { rms: number; peak: number; db: number } | null;
  segments: readonly Segment[];
  clearSegments: () => void;
  fallbackReason: string | null;
  pipeline: Pipeline;
  recordings: {
    cleaned: { getBlob: () => Promise<Blob | null>; durationMs: number };
    full: { getBlob: () => Promise<Blob | null>; durationMs: number };
    masked: { getBlob: () => Promise<Blob | null>; durationMs: number };
    meta: () => { sessionDurationMs: number; cleanedDurationMs: number };
    clear: () => void;
  };
}

export function useRecorder(options: UseRecorderOptions = {}): UseRecorderResult {
  const { stages, segmenter, constraints, mode, runtime: runtimeOverride, autoStart, allowFallback } = options;

  const contextRuntime = useSaraudioRuntime(runtimeOverride);
  const fallbackReason = useSaraudioFallbackReason();

  const [loadError, setLoadError] = useState<Error | null>(null);

  const stableStages = useStableLoaders(stages);
  const stableConstraints = useShallowStable(constraints);
  const finalSegmenter = useShallowStable(segmenter === false ? (false as const) : (segmenter ?? {}));

  const recorderOptions = useMemo(
    () => ({
      runtime: contextRuntime,
      stages: stableStages ?? [],
      segmenter: finalSegmenter,
      constraints: stableConstraints,
      mode,
      allowFallback,
    }),
    [contextRuntime, stableStages, finalSegmenter, stableConstraints, mode, allowFallback],
  );

  const [recorder, setRecorder] = useState(() => createRecorder(recorderOptions));

  useDeepCompareEffect(() => {
    const newRecorder = createRecorder(recorderOptions);
    setRecorder((prev) => {
      prev.dispose();
      return newRecorder;
    });
  }, [recorderOptions]);

  useEffect(() => {
    return () => {
      recorder.dispose();
    };
  }, [recorder]);

  const pipeline = recorder.pipeline;

  const [segments, setSegments] = useState<Segment[]>([]);
  const [isSpeech, setIsSpeech] = useState(false);
  const [lastVad, setLastVad] = useState<{ score: number; speech: boolean } | null>(null);

  const clearSegments = useCallback(() => setSegments([]), []);

  useEffect(() => {
    setSegments([]);

    const unsubscribeVad = recorder.onVad((v) => {
      setLastVad({ score: v.score, speech: v.speech });
      setIsSpeech(v.speech);
    });

    const unsubscribeSegment = recorder.onSegment((s) => {
      setSegments((prev) => (prev.length >= 10 ? [...prev.slice(1), s] : [...prev, s]));
    });

    const unsubscribeError = recorder.onError((e) => {
      setLoadError(new Error(e.message));
    });

    return () => {
      unsubscribeVad.unsubscribe();
      unsubscribeSegment.unsubscribe();
      unsubscribeError.unsubscribe();
    };
  }, [recorder]);

  const meterLevels = useMeter({ pipeline });

  const [status, setStatus] = useState(recorder.status);
  const [micError, setMicError] = useState<Error | null>(null);

  const start = useCallback(async () => {
    setMicError(null);
    setStatus('acquiring');
    try {
      await recorder.start();
      setStatus(recorder.status);
    } catch (e) {
      const error = toError(e);
      setMicError(error);
      setStatus('error');
      throw error;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    setStatus('stopping');
    try {
      await recorder.stop();
      setStatus(recorder.status);
    } catch (e) {
      const error = toError(e);
      setMicError(error);
      setStatus('error');
      throw error;
    }
  }, [recorder]);

  useEffect(() => {
    if (!autoStart) return;

    let cancelled = false;

    (async () => {
      try {
        await start();
      } catch {
        // Ignore - error already handled in start()
      }
    })();

    return () => {
      cancelled = true;
      if (!cancelled) {
        void stop();
      }
    };
  }, [autoStart, start, stop]);

  const error = loadError || micError;
  const vad = lastVad ? { isSpeech, score: lastVad.score } : null;

  return {
    status,
    error,
    start,
    stop,
    vad,
    levels: meterLevels,
    segments,
    clearSegments,
    fallbackReason,
    pipeline,
    recordings: recorder.recordings,
  };
}
