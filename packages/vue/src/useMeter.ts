import type { MeterPayload, Pipeline } from '@saraudio/core';
import type { Ref } from 'vue';
import { onMounted, onUnmounted, ref } from 'vue';

export interface UseMeterOptions {
  pipeline: Ref<Pipeline | null> | Pipeline | null;
  onMeter?: (payload: MeterPayload) => void;
}

export interface UseMeterResult {
  rms: Ref<number>;
  peak: Ref<number>;
  db: Ref<number>;
  reset: () => void;
}

export function useMeter(options: UseMeterOptions): UseMeterResult {
  const rms = ref(0);
  const peak = ref(0);
  const db = ref(-Infinity);

  onMounted(() => {
    if (!options.pipeline) return;

    // Extract pipeline value if it's a ref
    const pipelineValue = 'value' in options.pipeline ? options.pipeline.value : options.pipeline;
    if (!pipelineValue) return;

    const unsubscribe = pipelineValue.events.on('meter', (payload: MeterPayload) => {
      options.onMeter?.(payload);
      rms.value = payload.rms;
      peak.value = payload.peak;
      db.value = payload.db;
    });

    onUnmounted(() => {
      unsubscribe();
    });
  });

  const reset = () => {
    rms.value = 0;
    peak.value = 0;
    db.value = -Infinity;
  };

  return {
    rms,
    peak,
    db,
    reset,
  };
}
