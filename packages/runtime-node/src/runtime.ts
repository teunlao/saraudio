import { createSegmenterController, Pipeline, type StageController } from '@saraudio/core';
import { createRuntimeServices } from './context/services';
import { createPcm16FileSource } from './sources/pcm16-file-source';
import { createPcm16StreamSource } from './sources/pcm16-stream-source';
import type {
  NodePipelineOptions,
  NodeRuntime,
  Pcm16FileSourceOptions,
  Pcm16StreamSourceOptions,
  RunOptions,
  RuntimeOptions,
  SegmenterFactoryOptions,
} from './types';

const isStageController = (value: unknown): value is StageController =>
  typeof value === 'object' && value !== null && typeof (value as StageController).create === 'function';

const toSegmenterInput = (value: SegmenterFactoryOptions | StageController | undefined): StageController => {
  if (!value) {
    return createSegmenterController();
  }
  if (isStageController(value)) {
    return value;
  }
  return createSegmenterController(value);
};

const buildStages = (options?: NodePipelineOptions): StageController[] => {
  const base: StageController[] = options?.stages ? [...options.stages] : [];
  if (options?.segmenter !== false) {
    base.push(toSegmenterInput(options?.segmenter as SegmenterFactoryOptions | StageController | undefined));
  }
  return base;
};

export const createNodeRuntime = (options?: RuntimeOptions): NodeRuntime => {
  const services = createRuntimeServices(options);

  const createPipeline = (pipelineOptions?: NodePipelineOptions): Pipeline => {
    const pipeline = new Pipeline({
      now: () => services.clock(),
      createId: () => services.createId(),
    });

    if (pipelineOptions) {
      pipeline.configure({ stages: buildStages(pipelineOptions) });
    }

    return pipeline;
  };

  const createSegmenter = (options?: SegmenterFactoryOptions): StageController => createSegmenterController(options);

  const createStreamSource = (sourceOptions: Pcm16StreamSourceOptions) => createPcm16StreamSource(sourceOptions);

  const createFileSource = (sourceOptions: Pcm16FileSourceOptions) => createPcm16FileSource(sourceOptions);

  const run = async ({ source, pipeline, autoFlush = true }: RunOptions): Promise<void> => {
    try {
      await source.start((frame) => {
        pipeline.push(frame);
      });
      if (autoFlush) {
        pipeline.flush();
      }
    } finally {
      await source.stop();
    }
  };

  return {
    services,
    createPipeline,
    createSegmenter,
    createPcm16StreamSource: createStreamSource,
    createPcm16FileSource: createFileSource,
    run,
  };
};
