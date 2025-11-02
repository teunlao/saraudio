import type { StageController } from '@saraudio/core';
import { createAudioMeterController, createAudioMeterStage } from './meter';
export { createAudioMeterStage, createAudioMeterController };

// Short DX alias returning a controller.
// Usage: stages: [meter()]
export const meter = (): StageController => createAudioMeterController();
