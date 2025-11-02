import type { MeterPayload, Pipeline } from '@saraudio/core';
import { type Accessor, createEffect, createSignal, onCleanup } from 'solid-js';

export interface CreateMeterOptions {
  pipeline: Pipeline | null | Accessor<Pipeline | null>;
  onMeter?: (payload: MeterPayload) => void;
}

export interface MeterResult {
  readonly rms: Accessor<number>;
  readonly peak: Accessor<number>;
  readonly db: Accessor<number>;
  reset: () => void;
}

const INITIAL_VALUES = {
  rms: 0,
  peak: 0,
  db: -Infinity,
};

export function createMeter(options: CreateMeterOptions): MeterResult {
  const { pipeline: pipelineInput, onMeter } = options;
  const [rms, setRms] = createSignal(INITIAL_VALUES.rms);
  const [peak, setPeak] = createSignal(INITIAL_VALUES.peak);
  const [db, setDb] = createSignal(INITIAL_VALUES.db);

  createEffect(() => {
    const pipeline = typeof pipelineInput === 'function' ? pipelineInput() : pipelineInput;
    if (!pipeline) return;

    const unsubscribe = pipeline.events.on('meter', (payload: MeterPayload) => {
      onMeter?.(payload);
      setRms(payload.rms);
      setPeak(payload.peak);
      setDb(payload.db);
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  const reset = () => {
    setRms(INITIAL_VALUES.rms);
    setPeak(INITIAL_VALUES.peak);
    setDb(INITIAL_VALUES.db);
  };

  return {
    rms,
    peak,
    db,
    reset,
  };
}
