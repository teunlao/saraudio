import type { Frame, Stage, StageContext, StageController } from '@saraudio/core';
import { int16ToFloat32 } from '@saraudio/utils';

const EPS = 1e-12; // Epsilon to avoid -Infinity on very quiet frames

export function createAudioMeterStage(): Stage {
  let context: StageContext | null = null;

  const toFloat32 = (pcm: Frame['pcm']): Float32Array => (pcm instanceof Float32Array ? pcm : int16ToFloat32(pcm));

  return {
    name: 'audio-meter',
    setup(ctx) {
      context = ctx;
    },
    handle(frame) {
      if (!context) return;

      const float = toFloat32(frame.pcm);

      // Guard against empty buffer (division by zero)
      if (float.length === 0) {
        context.emit('meter', {
          rms: 0,
          peak: 0,
          db: -Infinity,
          tsMs: frame.tsMs,
        });
        return;
      }

      // Single pass: calculate RMS and Peak together
      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < float.length; i += 1) {
        const val = float[i] ?? 0;
        const sample = Number.isNaN(val) ? 0 : val; // NaN guard: treat NaN as 0
        sumSq += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }

      const rmsValue = Math.sqrt(sumSq / float.length);
      // dBFS (decibels relative to full scale), not dBSPL
      const db = rmsValue > EPS ? 20 * Math.log10(rmsValue) : -Infinity;

      context.emit('meter', {
        rms: rmsValue,
        peak,
        db,
        tsMs: frame.tsMs,
      });
    },
    flush() {
      // No state to flush
    },
    teardown() {
      context = null;
    },
  };
}

export const createAudioMeterController = (): StageController => ({
  id: 'audio-meter',
  create: () => createAudioMeterStage(),
  isEqual(other) {
    return other.id === 'audio-meter';
  },
});
