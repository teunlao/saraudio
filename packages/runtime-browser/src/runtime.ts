import { createSegmenterController, Pipeline, type Stage, type StageController, type StageInput } from '@saraudio/core';
import { createRuntimeServices } from './context/services';
import {
  snapshotCapabilities,
  supportsMediaRecorderPipeline,
  supportsWorkletPipeline,
} from './environment/capabilities';
import { createMediaRecorderSource } from './sources/media-recorder-source';
import { createWorkletMicrophoneSource } from './sources/worklet-source';
import type {
  BrowserFrameSource,
  BrowserPipelineOptions,
  BrowserRuntime,
  BrowserRuntimeOptions,
  FallbackReason,
  MicrophoneSourceOptions,
  RunOptions,
  RuntimeMode,
  SegmenterFactoryOptions,
} from './types';

const isStageInstance = (value: unknown): value is Stage =>
  typeof value === 'object' && value !== null && typeof (value as Stage).handle === 'function';

const isStageController = (value: unknown): value is StageController =>
  typeof value === 'object' && value !== null && typeof (value as StageController).create === 'function';

export const toSegmenterInput = (value: SegmenterFactoryOptions | Stage | StageController | undefined): StageInput => {
  if (!value) {
    return createSegmenterController();
  }
  if (isStageController(value)) {
    return value;
  }
  if (isStageInstance(value)) {
    return value;
  }
  return createSegmenterController(value);
};

export const buildStages = (opts?: BrowserPipelineOptions): StageInput[] => {
  const base = opts?.stages ? [...opts.stages] : [];
  if (opts?.segmenter !== false) {
    base.push(toSegmenterInput(opts?.segmenter));
  }
  return base;
};

const resolveMode = (
  requested: RuntimeMode,
  notifyFallback: (reason: FallbackReason) => void,
  allowFallback: boolean,
): RuntimeMode => {
  const snapshot = snapshotCapabilities();

  if (requested === 'worklet') {
    if (supportsWorkletPipeline(snapshot)) {
      return 'worklet';
    }
    if (!allowFallback) {
      throw new Error('AudioWorklet pipeline is not supported in this environment');
    }
    notifyFallback('worklet-unsupported');
    if (supportsMediaRecorderPipeline(snapshot)) {
      return 'media-recorder';
    }
    throw new Error('MediaRecorder API is not supported in this environment');
  }

  if (requested === 'media-recorder') {
    if (supportsMediaRecorderPipeline(snapshot)) {
      return 'media-recorder';
    }
    notifyFallback('media-recorder-unsupported');
    throw new Error('MediaRecorder API is not supported in this environment');
  }

  // auto mode
  if (supportsWorkletPipeline(snapshot)) {
    return 'worklet';
  }
  if (supportsMediaRecorderPipeline(snapshot)) {
    notifyFallback('worklet-unsupported');
    return 'media-recorder';
  }
  notifyFallback('media-recorder-unsupported');
  throw new Error('Neither AudioWorklet nor MediaRecorder are supported in this environment');
};

export const createBrowserRuntime = (options?: BrowserRuntimeOptions): BrowserRuntime => {
  const services = createRuntimeServices(options?.services);

  const createPipeline = (pipelineOptions?: BrowserPipelineOptions): Pipeline => {
    const pipeline = new Pipeline({
      now: () => services.clock(),
      createId: () => services.createId(),
    });

    if (pipelineOptions) pipeline.configure({ stages: buildStages(pipelineOptions) });

    return pipeline;
  };

  const createSegmenter = (segmenterOptions?: SegmenterFactoryOptions): StageController =>
    createSegmenterController(segmenterOptions);

  const createMicrophoneSource = (sourceOptions?: MicrophoneSourceOptions): BrowserFrameSource => {
    console.log('[runtime] createMicrophoneSource called', {
      requestedMode: sourceOptions?.mode ?? options?.mode ?? 'auto',
      allowFallback: sourceOptions?.allowFallback ?? true,
    });

    const mode = resolveMode(
      sourceOptions?.mode ?? options?.mode ?? 'auto',
      (reason) => {
        console.log('[runtime] fallback triggered', { reason });
        services.logger.warn('Runtime fallback', { reason });
        options?.onFallback?.(reason);
      },
      sourceOptions?.allowFallback ?? true,
    );

    console.log('[runtime] resolved mode:', mode);

    if (mode === 'worklet') {
      try {
        console.log('[runtime] creating worklet source');
        return createWorkletMicrophoneSource({
          constraints: sourceOptions?.constraints,
          ringBufferFrames: options?.worklet?.ringBufferFrames ?? 2048,
          onStream: sourceOptions?.onStream,
          logger: services.logger,
        });
      } catch (error) {
        console.log('[runtime] worklet creation failed', error);
        const allowFallback = sourceOptions?.allowFallback ?? true;
        if (!allowFallback) {
          console.log('[runtime] fallback disabled, rethrowing error');
          throw error;
        }
        console.log('[runtime] falling back to MediaRecorder');
        services.logger.warn('AudioWorklet microphone source not available, falling back to MediaRecorder', { error });
        options?.onFallback?.('worklet-unsupported');
        return createMediaRecorderSource({
          constraints: sourceOptions?.constraints,
          frameSize: options?.recorder?.frameSize,
          onStream: sourceOptions?.onStream,
          logger: services.logger,
        });
      }
    }

    console.log('[runtime] creating MediaRecorder source');
    return createMediaRecorderSource({
      constraints: sourceOptions?.constraints,
      frameSize: options?.recorder?.frameSize,
      onStream: sourceOptions?.onStream,
      logger: services.logger,
    });
  };

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
    createMicrophoneSource,
    run,
  };
};
