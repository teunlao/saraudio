export { EventBus } from './event-bus';
export type { PipelineDependencies, PipelineEvents, Stage, StageContext } from './pipeline';
export { Pipeline } from './pipeline';
export { RecordingAssembler, type RecordingAssemblerOptions } from './recording/recording-assembler';
export { encodeWavPcm16, segmentToWav } from './recording/wav-encoder';
export { createSegmenterStage, type SegmenterOptions } from './stages/segmenter';
export type { CoreError, Frame, MeterPayload, Segment, VADScore } from './types';
