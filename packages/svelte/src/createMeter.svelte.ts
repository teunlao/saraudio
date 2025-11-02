import type { MeterPayload, Pipeline } from '@saraudio/core';

export interface CreateMeterOptions {
  pipeline: Pipeline;
  onMeter?: (payload: MeterPayload) => void;
}

export interface MeterResult {
  readonly rms: number;
  readonly peak: number;
  readonly db: number;
  reset(): void;
}

const INITIAL_VALUES = {
  rms: 0,
  peak: 0,
  db: -Infinity,
};

export function createMeter(options: CreateMeterOptions): MeterResult {
  const { pipeline, onMeter } = options;
  let state = $state({ ...INITIAL_VALUES });

  $effect(() => {
    const unsubscribe = pipeline.events.on('meter', (payload: MeterPayload) => {
      onMeter?.(payload);
      state = {
        rms: payload.rms,
        peak: payload.peak,
        db: payload.db,
      };
    });

    return () => {
      unsubscribe();
    };
  });

  return {
    get rms() {
      return state.rms;
    },
    get peak() {
      return state.peak;
    },
    get db() {
      return state.db;
    },
    reset() {
      state = { ...INITIAL_VALUES };
    },
  };
}
