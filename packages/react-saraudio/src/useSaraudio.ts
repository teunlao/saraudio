import type { Pipeline, Segment } from '@saraudio/core';
import type { BrowserRuntime, MicrophoneSourceOptions, RuntimeMode } from '@saraudio/runtime-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSaraudioFallbackReason, useSaraudioRuntime } from './context';
import { useMeter } from './useMeter';
import { useSaraudioMicrophone } from './useSaraudioMicrophone';
import { useSaraudioPipeline } from './useSaraudioPipeline';
import { useStageLoader } from './useStageLoader';

function shallowEqual(a: VadOptions, b: VadOptions): boolean {
  const keysA = Object.keys(a) as (keyof VadOptions)[];
  const keysB = Object.keys(b) as (keyof VadOptions)[];
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export interface VadOptions {
  thresholdDb?: number;
  smoothMs?: number;
  floorDb?: number;
  ceilingDb?: number;
}

export interface UseSaraudioOptions {
  vad?: boolean | VadOptions;
  meter?: boolean;
  segmenter?: { preRollMs?: number; hangoverMs?: number };
  constraints?: MicrophoneSourceOptions['constraints'];
  mode?: RuntimeMode;
  runtime?: BrowserRuntime;
  autoStart?: boolean;
}

export interface UseSaraudioResult {
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
}

/**
 * Simple DX: All-in-one hook for SARAUDIO.
 * Manages runtime, pipeline, stages, and microphone automatically.
 *
 * **Plugin dependencies**: VAD and Meter stages are loaded dynamically from optional peer dependencies.
 * If a plugin is not installed, an error will be returned with installation instructions:
 * - VAD: `pnpm add @saraudio/vad-energy`
 * - Meter: `pnpm add @saraudio/meter`
 *
 * @example
 * ```tsx
 * const { status, start, stop, vad, levels } = useSaraudio({
 *   vad: { thresholdDb: -50, smoothMs: 30 },
 *   meter: true,
 *   constraints: { channelCount: 1, sampleRate: 16000 }
 * });
 * ```
 */
export function useSaraudio(options: UseSaraudioOptions = {}): UseSaraudioResult {
  const {
    vad: vadOptions,
    meter: meterOption,
    segmenter,
    constraints,
    mode,
    runtime: runtimeOverride,
    autoStart,
  } = options;

  const contextRuntime = useSaraudioRuntime(runtimeOverride);
  const fallbackReason = useSaraudioFallbackReason();
  const [loadError, setLoadError] = useState<Error | null>(null);
  const vadEnabled = !!vadOptions;
  const meterEnabled = Boolean(meterOption);

  const vadConfig = useMemo(() => {
    if (!vadOptions || vadOptions === true) return {};
    return vadOptions;
  }, [vadOptions]);

  const prevVadConfigRef = useRef<VadOptions>(vadConfig);
  const vadInitialConfigRef = useRef(vadConfig);
  vadInitialConfigRef.current = vadConfig;

  const loadVadStage = useCallback(async () => {
    const module = await import('@saraudio/vad-energy');
    return module.createEnergyVadStage(vadInitialConfigRef.current);
  }, []);

  const vadMissingError = useCallback(
    () => new Error('VAD plugin not found. Install it: pnpm add @saraudio/vad-energy'),
    [],
  );

  const vadStage = useStageLoader({
    enabled: vadEnabled,
    loadStage: loadVadStage,
    onMissing: vadMissingError,
    setLoadError,
  });

  const loadMeterStage = useCallback(async () => {
    const module = await import('@saraudio/meter');
    return module.createAudioMeterStage();
  }, []);

  const meterMissingError = useCallback(
    () => new Error('Meter plugin not found. Install it: pnpm add @saraudio/meter'),
    [],
  );

  const meterStage = useStageLoader({
    enabled: meterEnabled,
    loadStage: loadMeterStage,
    onMissing: meterMissingError,
    setLoadError,
  });

  // Hot-update VAD config when options change (without recreating stage)
  useEffect(() => {
    if (!vadStage) return;
    if ('updateConfig' in vadStage && typeof vadStage.updateConfig === 'function') {
      // Only call updateConfig if values actually changed (shallow-equal check)
      // Skip first call since stage is already created with initial config
      if (!shallowEqual(prevVadConfigRef.current, vadConfig)) {
        vadStage.updateConfig(vadConfig);
        prevVadConfigRef.current = vadConfig;
      }
    }
  }, [vadStage, vadConfig]);

  const stages = useMemo(() => {
    const result = [];
    if (vadStage) result.push(vadStage);
    if (meterStage) result.push(meterStage);
    console.log('[stages] MEMO', { count: result.length, hasVad: !!vadStage, hasMeter: !!meterStage });
    return result;
  }, [vadStage, meterStage]);

  // Create pipeline
  const { pipeline, isSpeech, lastVad, segments, clearSegments } = useSaraudioPipeline({
    stages,
    segmenter,
    retainSegments: 10,
    runtime: contextRuntime,
  });

  // Get meter levels
  const meterLevels = useMeter({ pipeline });

  // Microphone control
  const {
    status,
    error: micError,
    start: micStart,
    stop: micStop,
  } = useSaraudioMicrophone({
    pipeline,
    runtime: contextRuntime,
    constraints,
    mode,
    // Start is safe anytime; pipeline buffers until configured
    autoStart: Boolean(autoStart),
  });

  // Wrap start to wait until stages are ready if needed
  // Combine errors
  const error = loadError || micError;

  // VAD state
  const vad = lastVad ? { isSpeech, score: lastVad.score } : null;

  // Meter state
  const levels = meterEnabled ? meterLevels : null;

  return {
    status,
    error,
    start: micStart,
    stop: micStop,
    vad,
    levels,
    segments,
    clearSegments,
    fallbackReason,
    pipeline,
  };
}
