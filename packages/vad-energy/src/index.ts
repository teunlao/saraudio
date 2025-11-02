import type { Stage } from '@saraudio/core';
import { createEnergyVadStage } from './energy-vad-stage';

export type { EnergyVadOptions, EnergyVadStage } from './energy-vad-stage';
export { createEnergyVadStage };

// Short DX alias: returns a StageLoader (no-arg function creating the stage on start).
// Usage: stages: [vadEnergy({ thresholdDb, smoothMs })]
export const vadEnergy = (options?: import('./energy-vad-stage').EnergyVadOptions): (() => Stage | Promise<Stage>) => {
  return () => createEnergyVadStage(options);
};
