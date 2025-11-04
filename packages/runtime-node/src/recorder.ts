import { writeFile } from 'node:fs/promises';
import type {
  CoreError,
  Frame,
  NormalizedFrame,
  Pipeline,
  RecorderFormatOptions,
  RecorderFrameEncoding,
  Segment,
  StageController,
  VADScore,
} from '@saraudio/core';
import {
  cloneFrame,
  createSubscription,
  encodeWavPcm16,
  isStageController,
  normalizeFrame,
  PipelineManager,
  type RecorderConfigureOptions,
  type RecorderProduceOptions,
  type RecorderStatus,
  RecordingAssembler,
  type SubscribeHandle,
} from '@saraudio/core';
import { createNodeRuntime } from './runtime';
import type { NodeFrameSource, NodeRuntime, RuntimeOptions, SegmenterFactoryOptions } from './types';

export type { RecorderConfigureOptions, RecorderProduceOptions, RecorderStatus, SubscribeHandle };

export interface RecorderOptions<E extends RecorderFrameEncoding = 'pcm16'> {
  // Pipeline config
  stages?: StageController[];
  segmenter?: SegmenterFactoryOptions | StageController | false;
  // Source - must be provided or created via sourceOptions
  source?: NodeFrameSource;
  format?: Omit<RecorderFormatOptions, 'encoding'> & { encoding?: E };
  // Output builders
  produce?: RecorderProduceOptions;
  // Runtime options
  runtime?: NodeRuntime; // optional external runtime
  runtimeOptions?: RuntimeOptions; // used only if runtime not provided
}

export type RecorderUpdateOptions<E extends RecorderFrameEncoding = 'pcm16'> = Partial<
  Omit<RecorderOptions<E>, 'runtime' | 'runtimeOptions'>
>;

export interface RecordingExports {
  getBuffer(): Promise<Buffer | null>;
  saveToFile(path: string): Promise<void>;
  durationMs: number;
}

export interface Recorder<E extends RecorderFrameEncoding = 'pcm16'> {
  readonly status: RecorderStatus;
  readonly error: Error | null;
  readonly pipeline: Pipeline;
  configure(options?: RecorderConfigureOptions): Promise<void>;
  update(options?: RecorderUpdateOptions<E>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
  dispose(): void;
  // Events passthrough (for simple UI)
  onVad(handler: (payload: VADScore) => void): SubscribeHandle;
  onSegment(handler: (segment: Segment) => void): SubscribeHandle;
  onError(handler: (error: CoreError) => void): SubscribeHandle;
  // Live streaming
  subscribeFrames(handler: (frame: NormalizedFrame<E>) => void): SubscribeHandle;
  subscribeRawFrames(handler: (frame: Frame) => void): SubscribeHandle;
  subscribeSpeechFrames(handler: (frame: Frame) => void): SubscribeHandle;
  onReady(handler: () => void): SubscribeHandle;
  // Ready-made recordings
  recordings: {
    cleaned: RecordingExports;
    full: RecordingExports;
    masked: RecordingExports;
    meta(): { sessionDurationMs: number; cleanedDurationMs: number };
    clear(): void;
  };
}

export function createRecorder<E extends RecorderFrameEncoding = 'pcm16'>(
  options: RecorderOptions<E> = {},
): Recorder<E> {
  const runtime = options.runtime ?? createNodeRuntime(options.runtimeOptions);
  // Build empty pipeline now; configure with plugins on start()
  const pipeline: Pipeline = runtime.createPipeline();

  // Subscriptions
  const vadSubs = new Set<(payload: VADScore) => void>();
  const segSubs = new Set<(payload: Segment) => void>();
  const errSubs = new Set<(payload: CoreError) => void>();
  const rawSubs = new Set<(frame: Frame) => void>();
  const speechSubs = new Set<(frame: Frame) => void>();
  const frameSubs = new Set<(frame: NormalizedFrame<E>) => void>();
  const readySubs = new Set<() => void>();
  const normalizedBuffer: Frame[] = [];
  const NORMALIZED_BUFFER_LIMIT = 5;
  let framesReady = false;

  let status: RecorderStatus = 'idle';
  let lastError: Error | null = null;
  let source: NodeFrameSource | null = options.source ?? null;
  let formatOptions: RecorderFormatOptions | undefined = options.format;
  const produceState = {
    cleaned: options.produce?.cleaned ?? true,
    full: options.produce?.full ?? true,
    masked: options.produce?.masked ?? true,
  };
  const createAssembler = (): RecordingAssembler =>
    new RecordingAssembler({
      collectCleaned: produceState.cleaned,
      collectFull: produceState.full,
      collectMasked: produceState.masked,
    });
  let assembler = createAssembler();

  // Pipeline manager for handling events
  const pipelineManager = new PipelineManager({
    pipeline,
    assembler,
    callbacks: {
      onVad: (payload) => {
        for (const h of vadSubs) h(payload);
      },
      onSegment: (segment) => {
        for (const h of segSubs) h(segment);
      },
      onError: (error) => {
        for (const h of errSubs) h(error);
      },
    },
    onWarn: (message: string, context?: Record<string, unknown>): void => {
      runtime.services.logger.warn(message, context);
    },
  });

  pipelineManager.attach();

  const setStatus = (next: RecorderStatus) => {
    status = next;
  };

  let stageSources: StageController[] = options.stages ? [...options.stages] : [];
  let segmenterSource: RecorderOptions<E>['segmenter'] = options.segmenter;
  let currentStages: StageController[] = [];

  const resolveSegmenterInput = (input: RecorderOptions<E>['segmenter']): StageController | null => {
    if (input === false) {
      return null;
    }
    if (input === undefined) {
      return runtime.createSegmenter();
    }
    if (isStageController(input)) {
      return input;
    }
    return runtime.createSegmenter(input);
  };

  const refreshStages = (): void => {
    pipelineManager.attach();
    const resolved: StageController[] = [...stageSources];
    const segmenter = resolveSegmenterInput(segmenterSource);
    if (segmenter) {
      resolved.push(segmenter);
    }
    currentStages = resolved;
    pipeline.configure({ stages: currentStages });
  };

  const bufferNormalizedFrame = (frame: Frame): void => {
    normalizedBuffer.push(cloneFrame(frame));
    if (normalizedBuffer.length > NORMALIZED_BUFFER_LIMIT) {
      normalizedBuffer.shift();
    }
  };

  const markReady = (): void => {
    if (framesReady) {
      return;
    }
    framesReady = true;
    for (const handler of readySubs) {
      handler();
    }
  };

  type UpdateKey = keyof RecorderUpdateOptions<E>;

  const pipelineMutators: {
    [K in UpdateKey]?: (value: RecorderUpdateOptions<E>[K]) => boolean;
  } = {
    stages: (value) => {
      stageSources = value ? [...value] : [];
      return true;
    },
    segmenter: (value) => {
      segmenterSource = value;
      return true;
    },
    produce: (value) => {
      const nextProduce = value;
      if (nextProduce) {
        if ('cleaned' in nextProduce) {
          produceState.cleaned = nextProduce.cleaned ?? produceState.cleaned;
        }
        if ('full' in nextProduce) {
          produceState.full = nextProduce.full ?? produceState.full;
        }
        if ('masked' in nextProduce) {
          produceState.masked = nextProduce.masked ?? produceState.masked;
        }
      } else {
        produceState.cleaned = true;
        produceState.full = true;
        produceState.masked = true;
      }
      assembler = createAssembler();
      return false;
    },
    source: (value) => {
      source = value ?? null;
      return false;
    },
    format: (value) => {
      formatOptions = value;
      return false;
    },
  };

  const update = async (next: RecorderUpdateOptions<E> = {}): Promise<void> => {
    pipelineManager.attach();
    const entries = Object.entries(next) as Array<[UpdateKey, RecorderUpdateOptions<E>[UpdateKey]]>;
    let pipelineNeedsRefresh = entries.length === 0;

    for (const [key, value] of entries) {
      const pipelineMutator = pipelineMutators[key] as
        | ((input: RecorderUpdateOptions<E>[typeof key]) => boolean)
        | undefined;
      if (pipelineMutator) {
        if (pipelineMutator(value as RecorderUpdateOptions<E>[typeof key])) {
          pipelineNeedsRefresh = true;
        }
      }
    }

    if (pipelineNeedsRefresh) {
      refreshStages();
    }
  };

  const configure = async (next: RecorderConfigureOptions = {}): Promise<void> => {
    await update(next);
  };

  const start = async (): Promise<void> => {
    if (status === 'acquiring' || status === 'running') {
      return;
    }
    if (!source) {
      throw new Error('No source configured. Provide source in RecorderOptions or via update()');
    }
    lastError = null;
    setStatus('acquiring');
    normalizedBuffer.length = 0;
    framesReady = false;

    try {
      // Configure pipeline with stages (controllers allow dynamic reconfig)
      refreshStages();

      const localSource = source;
      await localSource.start((frame) => {
        assembler.begin(frame.tsMs);
        assembler.onFrame(frame);
        for (const h of rawSubs) h(frame);
        if (pipelineManager.isSegmentActive) {
          for (const h of speechSubs) h(frame);
        }
        const normalized = normalizeFrame(frame, {
          format: formatOptions,
          logger: runtime.services.logger,
        });
        bufferNormalizedFrame(normalized);
        const n = normalized as NormalizedFrame<E>;
        for (const h of frameSubs) h(n);
        markReady();
        pipeline.push(frame);
      });

      setStatus('running');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      setStatus('error');
      throw lastError;
    }
  };

  const stop = async (): Promise<void> => {
    if (status !== 'running' && status !== 'acquiring') {
      return;
    }
    if (!source) {
      return;
    }
    setStatus('stopping');
    try {
      await source.stop();
      pipeline.flush();
      assembler.end(runtime.services.clock());
      setStatus('idle');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      setStatus('error');
      throw lastError;
    } finally {
      framesReady = false;
      normalizedBuffer.length = 0;
    }
  };

  const reset = (): void => {
    assembler = createAssembler();
    normalizedBuffer.length = 0;
    framesReady = false;
  };

  const dispose = (): void => {
    pipelineManager.dispose();
    pipeline.dispose();
    normalizedBuffer.length = 0;
    framesReady = false;
  };

  const wrapRecording = (
    getter: () => { pcm: Int16Array; sampleRate: number; channels: number } | null,
  ): RecordingExports => ({
    async getBuffer() {
      const data = getter();
      if (!data) return null;
      const wav = encodeWavPcm16(data.pcm, { sampleRate: data.sampleRate, channels: data.channels });
      return Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength);
    },
    async saveToFile(path: string) {
      const buffer = await this.getBuffer();
      if (!buffer) {
        throw new Error('No recording data available');
      }
      await writeFile(path, buffer);
    },
    get durationMs() {
      const data = getter();
      if (!data) return 0;
      const frames = data.pcm.length / data.channels;
      return (frames / data.sampleRate) * 1000;
    },
  });

  return {
    get status() {
      return status;
    },
    get error() {
      return lastError;
    },
    get pipeline() {
      return pipeline;
    },
    configure,
    update,
    start,
    stop,
    reset,
    dispose,
    onVad: (h) => createSubscription(vadSubs, h),
    onSegment: (h) => createSubscription(segSubs, h),
    onError: (h) => createSubscription(errSubs, h),
    subscribeFrames: (handler) => {
      if (normalizedBuffer.length > 0) {
        for (const frame of normalizedBuffer) {
          const cloned = cloneFrame(frame) as NormalizedFrame<E>;
          handler(cloned);
        }
      }
      return createSubscription(frameSubs, handler);
    },
    subscribeRawFrames: (h) => createSubscription(rawSubs, h),
    subscribeSpeechFrames: (h) => createSubscription(speechSubs, h),
    onReady: (handler) => {
      if (framesReady) {
        handler();
      }
      return createSubscription(readySubs, handler);
    },
    recordings: {
      cleaned: wrapRecording(() => assembler.getCleaned()),
      full: wrapRecording(() => assembler.getFull()),
      masked: wrapRecording(() => assembler.getMasked()),
      meta: () => assembler.meta,
      clear: () => {
        reset();
      },
    },
  };
}
