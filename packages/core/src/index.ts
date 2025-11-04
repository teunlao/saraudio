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
  type RecorderConfigureOptions,
  type RecorderLifecycle,
  type RecorderProduceOptions,
  type RecorderState,
  type RecorderStatus,
  type RecorderSubscriptions,
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
export type { CoreError, Frame, MeterPayload, Segment, VADScore } from './types';
