import type { CoreError, Frame, Pipeline, Segment, StageController, VADScore } from '../index';

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
