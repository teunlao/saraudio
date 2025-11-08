export type { ProviderId, SessionAuthAdapter, SessionAuthIssueResult } from './auth/session';
export { EventBus } from './event-bus';
export type {
  NormalizedFrame,
  PCMForEncoding,
  RecorderEncodingOf,
  RecorderFormatOptions,
  RecorderFrameEncoding,
} from './format';
export { cloneFrame, type NormalizeFrameOptions, normalizeFrame } from './frame-normalizer';
export type {
  PipelineDependencies,
  PipelineEvents,
  Stage,
  StageContext,
  StageController,
  StageInput,
} from './pipeline';
export { Pipeline } from './pipeline';
export {
  createSubscription,
  isStageController,
  PipelineManager,
  type PipelineManagerCallbacks,
  type PipelineManagerOptions,
  type Recorder,
  type RecorderConfigureOptions,
  type RecorderLifecycle,
  type RecorderProduceOptions,
  type RecorderRecordings,
  type RecorderState,
  type RecorderStatus,
  type RecorderSubscriptions,
  type RecordingExports,
  type SubscribeHandle,
} from './recorder';
export { RecordingAssembler, type RecordingAssemblerOptions } from './recording/recording-assembler';
export { encodeWavPcm16, segmentToWav } from './recording/wav-encoder';
export {
  createSegmenterController,
  createSegmenterStage,
  type SegmenterOptions,
  type SegmenterStage,
} from './stages/segmenter';
export { defineProvider, hasHttp, hasWebSocket, type Transports } from './transcription/define-provider';
export * from './transcription/errors';
export type * from './transcription/types';

export type { CoreError, Frame, MeterPayload, Segment, VADScore } from './types';
// session auth types are exported once at the top (organized)
