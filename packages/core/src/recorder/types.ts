import type { CoreError, Frame, NormalizedFrame, Pipeline, RecorderFrameEncoding, Segment, StageController, VADScore } from '../index';

export type RecorderStatus = 'idle' | 'acquiring' | 'running' | 'stopping' | 'error';

export interface RecorderProduceOptions {
  cleaned?: boolean;
  full?: boolean;
  masked?: boolean;
}

export type SubscribeHandle = () => void;

export interface BaseRecorderCallbacks {
  onVad?: (payload: VADScore) => void;
  onSegment?: (payload: Segment) => void;
  onError?: (payload: CoreError) => void;
  onRawFrame?: (frame: Frame) => void;
  onSpeechFrame?: (frame: Frame) => void;
}

export interface RecorderConfigureOptions {
  stages?: StageController[];
  segmenter?: StageController | false;
}

export interface RecorderLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
  dispose(): void;
}

export interface RecorderSubscriptions {
  onVad(handler: (payload: VADScore) => void): SubscribeHandle;
  onSegment(handler: (segment: Segment) => void): SubscribeHandle;
  onError(handler: (error: CoreError) => void): SubscribeHandle;
  subscribeRawFrames(handler: (frame: Frame) => void): SubscribeHandle;
  subscribeSpeechFrames(handler: (frame: Frame) => void): SubscribeHandle;
}

export interface RecorderState {
  readonly status: RecorderStatus;
  readonly error: Error | null;
  readonly pipeline: Pipeline;
}

/**
 * Platform-agnostic recording exports interface.
 * Runtime implementations provide platform-specific output types:
 * - Browser: Blob via getBlob()
 * - Node: Buffer via getBuffer() and saveToFile()
 */
export interface RecordingExports {
  readonly durationMs: number;
}

/**
 * Full recording metadata and control interface.
 */
export interface RecorderRecordings<Exports extends RecordingExports = RecordingExports> {
  cleaned: Exports;
  full: Exports;
  masked: Exports;
  meta(): { sessionDurationMs: number; cleanedDurationMs: number };
  clear(): void;
}

/**
 * Core recorder interface used across browser and node runtimes.
 * Generic type E specifies the frame encoding (default: 'pcm16').
 * Generic type Exports allows platform-specific recording export types.
 */
export interface Recorder<
  E extends RecorderFrameEncoding = 'pcm16',
  Exports extends RecordingExports = RecordingExports
> extends RecorderState, RecorderLifecycle, RecorderSubscriptions {
  configure(options?: RecorderConfigureOptions): Promise<void>;
  update(options?: unknown): Promise<void>;
  // Live streaming
  subscribeFrames(handler: (frame: NormalizedFrame<E>) => void): SubscribeHandle;
  onReady(handler: () => void): SubscribeHandle;
  // Ready-made recordings
  recordings: RecorderRecordings<Exports>;
}
