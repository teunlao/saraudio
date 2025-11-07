import { createSegmenterController, type SegmenterOptions, type StageController } from '@saraudio/core';

const isStageController = (value: unknown): value is StageController =>
  typeof value === 'object' && value !== null && typeof (value as StageController).create === 'function';

export const toSegmenterInput = (value: SegmenterOptions | StageController | undefined): StageController => {
  if (!value) return createSegmenterController();
  if (isStageController(value)) return value;
  return createSegmenterController(value);
};

export interface WithStagesOptions {
  stages?: StageController[];
  segmenter?: SegmenterOptions | StageController | false;
}

export const buildStages = (opts?: WithStagesOptions): StageController[] => {
  const base: StageController[] = opts?.stages ? [...opts.stages] : [];
  if (opts?.segmenter !== false) {
    base.push(toSegmenterInput(opts?.segmenter));
  }
  return base;
};
