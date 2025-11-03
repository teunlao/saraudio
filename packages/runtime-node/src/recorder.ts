import { writeFile } from 'node:fs/promises';
import type { CoreError, Frame, Pipeline, Segment, StageController, VADScore } from '@saraudio/core';
import { encodeWavPcm16, RecordingAssembler } from '@saraudio/core';
import { createNodeRuntime } from './runtime';
import type { NodeFrameSource, NodeRuntime, RuntimeOptions, SegmenterFactoryOptions } from './types';

export type RecorderStatus = 'idle' | 'acquiring' | 'running' | 'stopping' | 'error';

export interface RecorderProduceOptions {
  cleaned?: boolean; // speech-only concatenated
  full?: boolean; // raw continuous capture
  masked?: boolean; // same length as full, silence → zeros
}

export interface RecorderOptions {
  // Pipeline config
  stages?: StageController[];
  segmenter?: SegmenterFactoryOptions | StageController | false;
  // Source - must be provided or created via sourceOptions
  source?: NodeFrameSource;
  // Output builders
  produce?: RecorderProduceOptions;
  // Runtime options
  runtime?: NodeRuntime; // optional external runtime
  runtimeOptions?: RuntimeOptions; // used only if runtime not provided
}

export type RecorderConfigureOptions = Partial<Pick<RecorderOptions, 'stages' | 'segmenter'>>;
export type RecorderUpdateOptions = Partial<Omit<RecorderOptions, 'runtime' | 'runtimeOptions'>>;

export interface SubscribeHandle {
  unsubscribe(): void;
}

export interface RecordingExports {
  getBuffer(): Promise<Buffer | null>;
  saveToFile(path: string): Promise<void>;
  durationMs: number;
}

export interface Recorder {
  readonly status: RecorderStatus;
  readonly error: Error | null;
  readonly pipeline: Pipeline;
  configure(options?: RecorderConfigureOptions): Promise<void>;
  update(options?: RecorderUpdateOptions): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
  dispose(): void;
  // Events passthrough (for simple UI)
  onVad(handler: (payload: VADScore) => void): SubscribeHandle;
  onSegment(handler: (segment: Segment) => void): SubscribeHandle;
  onError(handler: (error: CoreError) => void): SubscribeHandle;
  // Live streaming
  subscribeRawFrames(handler: (frame: Frame) => void): SubscribeHandle;
  subscribeSpeechFrames(handler: (frame: Frame) => void): SubscribeHandle;
  // Ready-made recordings
  recordings: {
    cleaned: RecordingExports;
    full: RecordingExports;
    masked: RecordingExports;
    meta(): { sessionDurationMs: number; cleanedDurationMs: number };
    clear(): void;
  };
}

export const createRecorder = (options: RecorderOptions = {}): Recorder => {
  const runtime = options.runtime ?? createNodeRuntime(options.runtimeOptions);
  // Build empty pipeline now; configure with plugins on start()
  const pipeline: Pipeline = runtime.createPipeline();

  // Subscriptions
  const vadSubs = new Set<(payload: VADScore) => void>();
  const segSubs = new Set<(payload: Segment) => void>();
  const errSubs = new Set<(payload: CoreError) => void>();
  const rawSubs = new Set<(frame: Frame) => void>();
  const speechSubs = new Set<(frame: Frame) => void>();

  let status: RecorderStatus = 'idle';
  let lastError: Error | null = null;
  let source: NodeFrameSource | null = options.source ?? null;
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
  let segmentActive = false;

  let listenersAttached = false;
  let detachPipelineListeners: Array<() => void> = [];

  const attachPipelineListeners = (): void => {
    if (listenersAttached) return;
    listenersAttached = true;
    const detachVad = pipeline.events.on('vad', (payload) => {
      for (const h of vadSubs) h(payload);
    });
    const detachSegStart = pipeline.events.on('speechStart', () => {
      segmentActive = true;
      assembler.onSpeechStart();
    });
    const detachSegEnd = pipeline.events.on('speechEnd', () => {
      segmentActive = false;
      assembler.onSpeechEnd();
    });
    const detachSegment = pipeline.events.on('segment', (segment) => {
      assembler.onSegment(segment);
      for (const h of segSubs) h(segment);
    });
    const detachError = pipeline.events.on('error', (error) => {
      for (const h of errSubs) h(error);
    });
    detachPipelineListeners = [detachVad, detachSegStart, detachSegEnd, detachSegment, detachError];
  };

  const detachPipelineListenersIfNeeded = (): void => {
    if (!listenersAttached) return;
    listenersAttached = false;
    while (detachPipelineListeners.length > 0) {
      const detach = detachPipelineListeners.pop();
      try {
        detach?.();
      } catch (error) {
        runtime.services.logger.warn('Pipeline detach failed', error);
      }
    }
  };

  attachPipelineListeners();

  const setStatus = (next: RecorderStatus) => {
    status = next;
  };

  const isStageControllerValue = (value: unknown): value is StageController =>
    typeof value === 'object' && value !== null && typeof (value as StageController).create === 'function';

  let stageSources: StageController[] = options.stages ? [...options.stages] : [];
  let segmenterSource: RecorderOptions['segmenter'] = options.segmenter;
  let currentStages: StageController[] = [];

  const resolveSegmenterInput = (input: RecorderOptions['segmenter']): StageController | null => {
    if (input === false) {
      return null;
    }
    if (input === undefined) {
      return runtime.createSegmenter();
    }
    if (isStageControllerValue(input)) {
      return input;
    }
    return runtime.createSegmenter(input);
  };

  const refreshStages = (): void => {
    attachPipelineListeners();
    const resolved: StageController[] = [...stageSources];
    const segmenter = resolveSegmenterInput(segmenterSource);
    if (segmenter) {
      resolved.push(segmenter);
    }
    currentStages = resolved;
    pipeline.configure({ stages: currentStages });
  };

  type UpdateKey = keyof RecorderUpdateOptions;

  const pipelineMutators: {
    [K in UpdateKey]?: (value: RecorderUpdateOptions[K]) => boolean;
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
  };

  const update = async (next: RecorderUpdateOptions = {}): Promise<void> => {
    attachPipelineListeners();
    const entries = Object.entries(next) as Array<[UpdateKey, RecorderUpdateOptions[UpdateKey]]>;
    let pipelineNeedsRefresh = entries.length === 0;

    for (const [key, value] of entries) {
      const pipelineMutator = pipelineMutators[key] as
        | ((input: RecorderUpdateOptions[typeof key]) => boolean)
        | undefined;
      if (pipelineMutator) {
        if (pipelineMutator(value as RecorderUpdateOptions[typeof key])) {
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

    try {
      // Configure pipeline with stages (controllers allow dynamic reconfig)
      refreshStages();

      const localSource = source;
      await localSource.start((frame) => {
        assembler.begin(frame.tsMs);
        assembler.onFrame(frame);
        for (const h of rawSubs) h(frame);
        if (segmentActive) {
          for (const h of speechSubs) h(frame);
        }
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
    }
  };

  const reset = (): void => {
    assembler = createAssembler();
  };

  const dispose = (): void => {
    detachPipelineListenersIfNeeded();
    pipeline.dispose();
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

  const subscribe = <T>(set: Set<(value: T) => void>, handler: (value: T) => void): SubscribeHandle => {
    set.add(handler);
    return {
      unsubscribe() {
        set.delete(handler);
      },
    };
  };

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
    onVad: (h) => subscribe(vadSubs, h),
    onSegment: (h) => subscribe(segSubs, h),
    onError: (h) => subscribe(errSubs, h),
    subscribeRawFrames: (h) => subscribe(rawSubs, h),
    subscribeSpeechFrames: (h) => subscribe(speechSubs, h),
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
};
