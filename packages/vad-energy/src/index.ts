import type { StageController } from '@saraudio/core';
import type { EnergyVadStage } from './energy-vad-stage';
import { createEnergyVadController, createEnergyVadStage } from './energy-vad-stage';

export type { EnergyVadOptions, EnergyVadStage } from './energy-vad-stage';
export { createEnergyVadStage, createEnergyVadController };

// Convenience alias returning a configurable controller.
// Usage: stages: [vadEnergy({ thresholdDb, smoothMs })]
export const vadEnergy = (options?: import('./energy-vad-stage').EnergyVadOptions): StageController<EnergyVadStage> =>
  createEnergyVadController(options);
