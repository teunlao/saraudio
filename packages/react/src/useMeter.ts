import type { MeterPayload, Pipeline } from '@saraudio/core';
import { useCallback, useEffect, useState } from 'react';

export interface UseMeterOptions {
  pipeline: Pipeline | null;
  onMeter?: (payload: MeterPayload) => void;
}

export interface UseMeterResult {
  rms: number;
  peak: number;
  db: number;
  reset: () => void;
}

const INITIAL_STATE = {
  rms: 0,
  peak: 0,
  db: -Infinity,
};

export const useMeter = (options: UseMeterOptions): UseMeterResult => {
  const { pipeline, onMeter } = options;
  const [meterState, setMeterState] = useState<typeof INITIAL_STATE>(INITIAL_STATE);

  const reset = useCallback(() => {
    setMeterState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    setMeterState(INITIAL_STATE);

    if (!pipeline) return;

    const unsubscribe = pipeline.events.on('meter', (payload: MeterPayload) => {
      onMeter?.(payload);
      setMeterState({
        rms: payload.rms,
        peak: payload.peak,
        db: payload.db,
      });
    });

    return () => {
      unsubscribe();
    };
  }, [pipeline, onMeter]);

  return { ...meterState, reset };
};
