import type { Stage } from '@saraudio/core';
import { createAudioMeterStage } from './meter';
export { createAudioMeterStage };

// Short DX alias: returns a StageLoader (no-arg function creating the stage on start).
// Usage: stages: [meter()]
export const meter = (): (() => Stage | Promise<Stage>) => {
  return () => createAudioMeterStage();
};
