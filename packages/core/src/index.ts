export { EventBus } from './event-bus';
export type {
  PipelineDependencies,
  PipelineEvents,
  Stage,
  StageContext,
  StageController,
  StageInput,
} from './pipeline';
export { Pipeline } from './pipeline';
export { RecordingAssembler, type RecordingAssemblerOptions } from './recording/recording-assembler';
export { encodeWavPcm16, segmentToWav } from './recording/wav-encoder';
export {
  createSegmenterController,
  createSegmenterStage,
  type SegmenterOptions,
  type SegmenterStage,
} from './stages/segmenter';
export type { CoreError, Frame, MeterPayload, Segment, VADScore } from './types';
