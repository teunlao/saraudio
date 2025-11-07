import type { Frame, Pipeline, SegmenterOptions, StageController } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';

export type RuntimeMode = 'worklet' | 'media-recorder' | 'auto';

export type FallbackReason = 'worklet-unsupported' | 'media-recorder-unsupported' | 'display-audio-unsupported';

export interface RuntimeServices {
  clock: () => number;
  createId: () => string;
  logger: Logger;
}

export interface RuntimeServiceOverrides extends Partial<RuntimeServices> {}

export interface BrowserRuntimeOptions {
  mode?: RuntimeMode;
  services?: RuntimeServiceOverrides;
  worklet?: {
    ringBufferFrames?: number;
  };
  recorder?: {
    frameSize?: number;
  };
  onFallback?: (reason: FallbackReason) => void;
}

export type SegmenterFactoryOptions = SegmenterOptions;

export interface BrowserPipelineOptions {
  stages?: StageController[];
  segmenter?: SegmenterFactoryOptions | StageController | false;
}

export interface BrowserFrameSource {
  start(onFrame: (frame: Frame) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface MicrophoneSourceOptions {
  constraints?: MediaTrackConstraints | MediaStreamConstraints['audio'];
  mode?: RuntimeMode;
  onStream?: (stream: MediaStream | null) => void;
  allowFallback?: boolean;
}

export interface MicrophoneSourceConfig {
  deviceId?: string;
}

export interface RecorderSourceOptions {
  microphone?: MicrophoneSourceConfig;
}

export interface RunOptions {
  source: BrowserFrameSource;
  pipeline: Pipeline;
  autoFlush?: boolean;
}

export interface BrowserRuntime {
  readonly services: RuntimeServices;
  createPipeline(options?: BrowserPipelineOptions): Pipeline;
  createSegmenter(options?: SegmenterFactoryOptions): StageController;
  createMicrophoneSource(options?: MicrophoneSourceOptions): BrowserFrameSource;
  run(options: RunOptions): Promise<void>;
}

export type { RecorderFormatOptions } from '@saraudio/core';
