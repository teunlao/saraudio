import type { Pipeline, Segment, StageController } from '@saraudio/core';
import type { BrowserRuntime, RuntimeMode, SegmenterFactoryOptions } from '@saraudio/runtime-browser';
import { createRecorder } from '@saraudio/runtime-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSaraudioFallbackReason, useSaraudioRuntime } from './context';
import { toError } from './internal/errorUtils';
import { useDeepCompareEffect } from './internal/useDeepCompareEffect';
import { useShallowStable } from './internal/useShallowStable';
import { useStableControllers } from './internal/useStableControllers';
import { useMeter } from './useMeter';

export interface UseRecorderOptions {
  stages?: StageController[];
  segmenter?: SegmenterFactoryOptions | StageController | false;
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
  const { stages, segmenter, mode, runtime: runtimeOverride, autoStart, allowFallback } = options;

  const contextRuntime = useSaraudioRuntime(runtimeOverride);
  const fallbackReason = useSaraudioFallbackReason();

  const [loadError, setLoadError] = useState<Error | null>(null);

  const stableStages = useStableControllers(stages);
  const normalizedSegmenter = segmenter === false ? undefined : segmenter;
  const stableSegmenter = useShallowStable(normalizedSegmenter);
  const finalSegmenter = segmenter === false ? (false as const) : stableSegmenter;

  interface RecorderConfigSnapshot {
    stages: StageController[];
    segmenter: SegmenterFactoryOptions | StageController | false | undefined;
    mode?: RuntimeMode;
    allowFallback?: boolean;
  }

  const config = useMemo<RecorderConfigSnapshot>(
    () => ({
      stages: stableStages ?? [],
      segmenter: finalSegmenter,
      mode,
      allowFallback,
    }),
    [stableStages, finalSegmenter, mode, allowFallback],
  );

  const [recorder, setRecorder] = useState(() =>
    createRecorder({
      runtime: contextRuntime,
      ...config,
    }),
  );

  const runtimeRef = useRef(contextRuntime);
  const prevConfigRef = useRef<RecorderConfigSnapshot | null>(config);

  useDeepCompareEffect(() => {
    const prev = prevConfigRef.current;
    prevConfigRef.current = config;

    if (runtimeRef.current !== contextRuntime) {
      runtimeRef.current = contextRuntime;
      setRecorder((prevRecorder) => {
        prevRecorder.dispose();
        return createRecorder({
          runtime: contextRuntime,
          ...config,
        });
      });
      return;
    }

    if (!prev) return;

    const updatePayload: {
      stages?: StageController[];
      segmenter?: SegmenterFactoryOptions | StageController | false | undefined;
      mode?: RuntimeMode;
      allowFallback?: boolean;
    } = {};
    let needsUpdate = false;

    if (prev.stages !== config.stages) {
      updatePayload.stages = config.stages;
      needsUpdate = true;
    }
    if (prev.segmenter !== config.segmenter) {
      updatePayload.segmenter = config.segmenter;
      needsUpdate = true;
    }
    if (prev.mode !== config.mode) {
      updatePayload.mode = config.mode;
      needsUpdate = true;
    }
    if (prev.allowFallback !== config.allowFallback) {
      updatePayload.allowFallback = config.allowFallback;
      needsUpdate = true;
    }

    if (!needsUpdate) return;

    setLoadError(null);
    let cancelled = false;

    (async () => {
      try {
        await recorder.update(updatePayload);
      } catch (err) {
        if (!cancelled) {
          setLoadError(toError(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contextRuntime, config, recorder]);

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
      unsubscribeVad();
      unsubscribeSegment();
      unsubscribeError();
    };
  }, [recorder]);

  const { rms, peak, db } = useMeter({ pipeline });

  const [status, setStatus] = useState(recorder.status);
  const [micError, setMicError] = useState<Error | null>(null);

  useEffect(() => {
    setStatus(recorder.status);
    setMicError(null);
  }, [recorder]);

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
    levels: { rms, peak, db },
    segments,
    clearSegments,
    fallbackReason,
    pipeline,
    recordings: recorder.recordings,
  };
}
