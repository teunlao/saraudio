import type { Readable } from 'node:stream';
import type { Frame, Pipeline, Stage, StageController, StageInput } from '@saraudio/core';

export interface RuntimeLogger {
  info: (...messages: ReadonlyArray<unknown>) => void;
  warn: (...messages: ReadonlyArray<unknown>) => void;
  error: (...messages: ReadonlyArray<unknown>) => void;
}

export interface RuntimeServices {
  logger: RuntimeLogger;
  clock: () => number;
  createId: () => string;
}

export interface RuntimeOptions {
  services?: Partial<RuntimeServices>;
}

export interface NodePipelineOptions {
  stages?: StageInput[];
  segmenter?: SegmenterFactoryOptions | Stage | StageController | false;
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

export interface SegmenterFactoryOptions {
  preRollMs?: number;
  hangoverMs?: number;
}
