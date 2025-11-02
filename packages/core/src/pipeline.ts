import { EventBus } from './event-bus';
import type { CoreError, Frame, MeterPayload, Segment, VADScore } from './types';

export interface PipelineEvents extends Record<string, unknown> {
  vad: VADScore;
  speechStart: { tsMs: number };
  speechEnd: { tsMs: number };
  segment: Segment;
  meter: MeterPayload;
  error: CoreError;
}

export interface PipelineDependencies {
  now(): number;
  createId(): string;
}

export interface StageContext {
  emit<K extends keyof PipelineEvents>(event: K, payload: PipelineEvents[K]): void;
  on<K extends keyof PipelineEvents>(event: K, handler: (payload: PipelineEvents[K]) => void): () => void;
  now(): number;
  createId(): string;
}

export interface Stage {
  readonly name?: string;
  setup(context: StageContext): void;
  handle(frame: Frame): void;
  flush?(): void;
  teardown?(): void;
}

export interface StageController<TStage extends Stage = Stage> {
  readonly id: string;
  create(): TStage;
  configure?(stage: TStage): void;
  isEqual?(other: StageController<TStage>): boolean;
  readonly metadata?: unknown;
}

export type StageInput = Stage | StageController;

interface StageRecord {
  stage: Stage;
  controller?: StageController;
}

const isStageController = (value: StageInput): value is StageController => {
  return typeof value === 'object' && value !== null && typeof (value as StageController).create === 'function';
};

const controllersMatch = (a: StageController | undefined, b: StageController): boolean => {
  if (!a) return false;
  if (a === b) return true;
  if (a.id !== b.id) return false;
  if (typeof a.isEqual === 'function') return a.isEqual(b);
  if (typeof b.isEqual === 'function') return b.isEqual(a);
  if (a.metadata !== undefined || b.metadata !== undefined) {
    return a.metadata === b.metadata;
  }
  return false;
};

export class Pipeline {
  readonly events: EventBus<PipelineEvents>;

  private records: StageRecord[] = [];

  private ready = false;

  private buffer: Frame[] = [];

  private maxBuffer = 64;

  private readonly now: () => number;

  private readonly createId: () => string;

  constructor(deps: PipelineDependencies) {
    this.now = deps.now;
    this.createId = deps.createId;
    this.events = new EventBus<PipelineEvents>();
  }

  use(stage: Stage): this {
    this.setupStage(stage);
    this.records.push({ stage });
    this.ready = this.records.length > 0;
    return this;
  }

  clear(): void {
    for (let i = 0; i < this.records.length; i += 1) {
      const stage = this.records[i].stage;
      stage.teardown?.();
    }
    this.records = [];
    this.ready = false;
  }

  configure({ stages }: { stages: StageInput[] }): void {
    const previous = this.records.slice();
    const next: StageRecord[] = [];

    for (let i = 0; i < stages.length; i += 1) {
      const stageInput = stages[i];
      const prevRecord = previous[i];

      if (isStageController(stageInput)) {
        if (prevRecord && controllersMatch(prevRecord.controller, stageInput)) {
          stageInput.configure?.(prevRecord.stage as Stage);
          next.push({ stage: prevRecord.stage, controller: stageInput });
          previous[i] = undefined as unknown as StageRecord;
          continue;
        }

        if (prevRecord) {
          prevRecord.stage.teardown?.();
          previous[i] = undefined as unknown as StageRecord;
        }

        const stage = stageInput.create();
        this.setupStage(stage);
        stageInput.configure?.(stage);
        next.push({ stage, controller: stageInput });
        continue;
      }

      if (prevRecord) {
        prevRecord.stage.teardown?.();
        previous[i] = undefined as unknown as StageRecord;
      }

      const stage = stageInput;
      this.setupStage(stage);
      next.push({ stage });
    }

    for (let i = 0; i < previous.length; i += 1) {
      const leftover = previous[i];
      if (leftover) {
        leftover.stage.teardown?.();
      }
    }

    this.records = next;
    this.ready = this.records.length > 0;

    if (this.buffer.length > 0 && this.ready) {
      const frames = this.buffer;
      this.buffer = [];
      for (const frame of frames) {
        this.push(frame);
      }
    }
  }

  push(frame: Frame): void {
    if (!this.ready) {
      if (this.buffer.length < this.maxBuffer) this.buffer.push(frame);
      return;
    }
    for (let i = 0; i < this.records.length; i += 1) {
      this.records[i].stage.handle(frame);
    }
  }

  flush(): void {
    for (let i = 0; i < this.records.length; i += 1) {
      this.records[i].stage.flush?.();
    }
  }

  dispose(): void {
    for (let i = 0; i < this.records.length; i += 1) {
      const stage = this.records[i].stage;
      stage.teardown?.();
    }
    this.records = [];
    this.ready = false;
  }

  private setupStage(stage: Stage): void {
    const context: StageContext = {
      emit: (event, payload) => {
        this.events.emit(event, payload);
      },
      on: (event, handler) => this.events.on(event, handler),
      now: () => this.now(),
      createId: () => this.createId(),
    };

    stage.setup(context);
  }
}
