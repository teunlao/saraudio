import { createSegmenterController, Pipeline, type StageController } from '@saraudio/core';
import { buildStages, toSegmenterInput } from '@saraudio/runtime-base';
import { createRuntimeServices } from './context/services';
import {
  snapshotCapabilities,
  supportsMediaRecorderPipeline,
  supportsWorkletPipeline,
} from './environment/capabilities';
import { createAudioContextSource } from './sources/audio-context-source';
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

export { buildStages, toSegmenterInput };

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
    services.logger.debug('createMicrophoneSource', {
      requestedMode: sourceOptions?.mode ?? options?.mode ?? 'auto',
      allowFallback: sourceOptions?.allowFallback ?? true,
    });

    const mode = resolveMode(
      sourceOptions?.mode ?? options?.mode ?? 'auto',
      (reason) => {
        services.logger.warn('Runtime fallback', { reason });
        options?.onFallback?.(reason);
      },
      sourceOptions?.allowFallback ?? true,
    );
    services.logger.debug('resolved runtime mode', { mode });

    if (mode === 'worklet') {
      try {
        services.logger.debug('creating worklet source');
        return createWorkletMicrophoneSource({
          constraints: sourceOptions?.constraints,
          ringBufferFrames: options?.worklet?.ringBufferFrames ?? 2048,
          onStream: sourceOptions?.onStream,
          logger: services.logger,
        });
      } catch (error) {
        services.logger.warn('worklet creation failed', { error });
        const allowFallback = sourceOptions?.allowFallback ?? true;
        if (!allowFallback) {
          services.logger.debug('fallback disabled, rethrowing error');
          throw error;
        }
        services.logger.warn('AudioWorklet microphone source not available, falling back to AudioContext source', {
          error,
        });
        options?.onFallback?.('worklet-unsupported');
        return createAudioContextSource({
          constraints: sourceOptions?.constraints,
          frameSize: options?.recorder?.frameSize,
          onStream: sourceOptions?.onStream,
          logger: services.logger,
        });
      }
    }
    services.logger.debug('creating AudioContext source');
    return createAudioContextSource({
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
