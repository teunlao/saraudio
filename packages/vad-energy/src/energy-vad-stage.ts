import type { Frame, Stage, StageContext, StageController } from '@saraudio/core';
import { int16ToFloat32, rms } from '@saraudio/utils';

export interface EnergyVadOptions {
  thresholdDb?: number;
  floorDb?: number;
  ceilingDb?: number;
  smoothMs?: number;
  minRms?: number;
}

export interface EnergyVadStage extends Stage {
  updateConfig(options: Partial<EnergyVadOptions>): void;
}

interface VadState {
  hasValue: boolean;
  smoothedDb: number;
  lastTs: number;
}

const createInitialState = (): VadState => ({
  hasValue: false,
  smoothedDb: 0,
  lastTs: 0,
});

export function createEnergyVadStage(options: EnergyVadOptions = {}): EnergyVadStage {
  let thresholdDb = options.thresholdDb ?? -50;
  let floorDb = options.floorDb ?? -100;
  let ceilingDb = options.ceilingDb ?? 0;
  let smoothMs = Math.max(1, options.smoothMs ?? 50);
  let minRms = options.minRms ?? 1e-4;

  let context: StageContext | null = null;
  let state: VadState = createInitialState();

  const toFloat32 = (pcm: Frame['pcm']): Float32Array => (pcm instanceof Float32Array ? pcm : int16ToFloat32(pcm));

  const updateSmoothedDb = (currentDb: number, tsMs: number): number => {
    if (!state.hasValue) {
      state = { hasValue: true, smoothedDb: currentDb, lastTs: tsMs };
      return currentDb;
    }
    const deltaMs = Math.max(1, tsMs - state.lastTs);
    const weight = Math.min(1, deltaMs / smoothMs);
    const smoothed = state.smoothedDb + (currentDb - state.smoothedDb) * weight;
    state = { hasValue: true, smoothedDb: smoothed, lastTs: tsMs };
    return smoothed;
  };

  return {
    name: 'vad-energy',
    setup(ctx) {
      context = ctx;
      state = createInitialState();
    },
    handle(frame) {
      if (!context) return;
      const float = toFloat32(frame.pcm);
      const energy = rms(float);
      const clamped = Math.max(energy, minRms);
      const currentDb = 20 * Math.log10(clamped);
      const smoothedDb = updateSmoothedDb(currentDb, frame.tsMs);

      const score = Math.min(1, Math.max(0, (smoothedDb - floorDb) / (ceilingDb - floorDb)));
      const speech = smoothedDb >= thresholdDb;

      context.emit('vad', { tsMs: frame.tsMs, score, speech });
    },
    flush() {
      // nothing to flush
    },
    teardown() {
      state = createInitialState();
      context = null;
    },
    updateConfig(newOptions) {
      thresholdDb = newOptions.thresholdDb ?? thresholdDb;
      floorDb = newOptions.floorDb ?? floorDb;
      ceilingDb = newOptions.ceilingDb ?? ceilingDb;
      smoothMs = Math.max(1, newOptions.smoothMs ?? smoothMs);
      minRms = newOptions.minRms ?? minRms;
    },
  };
}

interface NormalizedEnergyVadOptions {
  thresholdDb: number;
  floorDb: number;
  ceilingDb: number;
  smoothMs: number;
  minRms: number;
}

const normalizeOptions = (options: EnergyVadOptions = {}): NormalizedEnergyVadOptions => ({
  thresholdDb: options.thresholdDb ?? -50,
  floorDb: options.floorDb ?? -100,
  ceilingDb: options.ceilingDb ?? 0,
  smoothMs: Math.max(1, options.smoothMs ?? 50),
  minRms: options.minRms ?? 1e-4,
});

const optionsKey = (options: NormalizedEnergyVadOptions): string =>
  `${options.thresholdDb}|${options.floorDb}|${options.ceilingDb}|${options.smoothMs}|${options.minRms}`;

export const createEnergyVadController = (options: EnergyVadOptions = {}): StageController<EnergyVadStage> => {
  const normalized = normalizeOptions(options);
  const key = optionsKey(normalized);

  return {
    id: 'vad-energy',
    key,
    create: () => createEnergyVadStage(normalized),
    configure: (stage) => {
      stage.updateConfig(normalized);
    },
  };
};
