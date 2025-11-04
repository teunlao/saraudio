import type { CoreError, Pipeline, Segment, VADScore } from '../index';
import type { RecordingAssembler } from '../recording/recording-assembler';

export interface PipelineManagerCallbacks {
  onVad: (payload: VADScore) => void;
  onSegment: (segment: Segment) => void;
  onError: (error: CoreError) => void;
}

export interface PipelineManagerOptions {
  pipeline: Pipeline;
  assembler: RecordingAssembler;
  callbacks: PipelineManagerCallbacks;
  onWarn?: (message: string, context?: Record<string, unknown>) => void;
}

export class PipelineManager {
  private listenersAttached = false;
  private detachFunctions: Array<() => void> = [];
  private readonly pipeline: Pipeline;
  private readonly assembler: RecordingAssembler;
  private readonly callbacks: PipelineManagerCallbacks;
  private readonly onWarn?: (message: string, context?: Record<string, unknown>) => void;
  private segmentActive = false;

  constructor(options: PipelineManagerOptions) {
    this.pipeline = options.pipeline;
    this.assembler = options.assembler;
    this.callbacks = options.callbacks;
    this.onWarn = options.onWarn;
  }

  get isSegmentActive(): boolean {
    return this.segmentActive;
  }

  attach(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    const detachVad = this.pipeline.events.on('vad', (payload) => {
      this.callbacks.onVad(payload);
    });

    const detachSegStart = this.pipeline.events.on('speechStart', () => {
      this.segmentActive = true;
      this.assembler.onSpeechStart();
    });

    const detachSegEnd = this.pipeline.events.on('speechEnd', () => {
      this.segmentActive = false;
      this.assembler.onSpeechEnd();
    });

    const detachSegment = this.pipeline.events.on('segment', (segment) => {
      this.assembler.onSegment(segment);
      this.callbacks.onSegment(segment);
    });

    const detachError = this.pipeline.events.on('error', (error) => {
      this.callbacks.onError(error);
    });

    this.detachFunctions = [detachVad, detachSegStart, detachSegEnd, detachSegment, detachError];
  }

  detach(): void {
    if (!this.listenersAttached) return;
    this.listenersAttached = false;

    while (this.detachFunctions.length > 0) {
      const detach = this.detachFunctions.pop();
      try {
        detach?.();
      } catch (error) {
        this.onWarn?.('Pipeline detach failed', { error });
      }
    }
  }

  dispose(): void {
    this.detach();
  }
}
