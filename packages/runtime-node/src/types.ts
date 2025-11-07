import type { Readable } from 'node:stream';
import type { Frame, Pipeline, SegmenterOptions, StageController } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';

export interface RuntimeServices {
  logger: Logger;
  clock: () => number;
  createId: () => string;
}

export interface RuntimeOptions {
  services?: Partial<RuntimeServices>;
}

export interface NodePipelineOptions {
  stages?: StageController[];
  segmenter?: SegmenterFactoryOptions | StageController | false;
}

export interface NodeFrameSource {
  start(onFrame: (frame: Frame) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface Pcm16StreamSourceOptions {
  stream: Readable;
  sampleRate: number;
  channels: 1 | 2;
  frameSize?: number;
}

export interface Pcm16FileSourceOptions {
  path: string;
  sampleRate: number;
  channels: 1 | 2;
  frameSize?: number;
  createReadStream?: (path: string) => Readable;
}

export interface RunOptions {
  source: NodeFrameSource;
  pipeline: Pipeline;
  autoFlush?: boolean;
}

export interface NodeRuntime {
  readonly services: RuntimeServices;
  createPipeline(options?: NodePipelineOptions): Pipeline;
  createSegmenter(options?: SegmenterFactoryOptions): StageController;
  createPcm16StreamSource(options: Pcm16StreamSourceOptions): NodeFrameSource;
  createPcm16FileSource(options: Pcm16FileSourceOptions): NodeFrameSource;
  run(options: RunOptions): Promise<void>;
}

export type SegmenterFactoryOptions = SegmenterOptions;
