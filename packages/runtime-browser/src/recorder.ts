import type {
  CoreError,
  Frame,
  Pipeline,
  RecorderFormatOptions,
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
import { createBrowserRuntime } from './runtime';
import type {
  BrowserRuntime,
  BrowserRuntimeOptions,
  MicrophoneSourceOptions,
  RecorderSourceOptions,
  RuntimeMode,
  SegmenterFactoryOptions,
} from './types';

export type { RecorderConfigureOptions, RecorderProduceOptions, RecorderStatus, SubscribeHandle };

const deriveConstraintsFromSource = (
  source: RecorderSourceOptions | undefined,
  // TODO remove legacy constraints after deprecating RecorderOptions.constraints
  fallback: MicrophoneSourceOptions['constraints'],
): MicrophoneSourceOptions['constraints'] => {
  const deviceId = source?.microphone?.deviceId?.trim();
  if (deviceId && deviceId.length > 0) {
    return { deviceId: { exact: deviceId } } satisfies MediaTrackConstraints;
  }
  return fallback;
};

export interface RecorderOptions {
  // Pipeline config
  stages?: StageController[];
  segmenter?: SegmenterFactoryOptions | StageController | false;
  // Capture options
  source?: RecorderSourceOptions;
  format?: RecorderFormatOptions;
  // TODO remove legacy constraints after deprecating RecorderOptions.constraints
  constraints?: MicrophoneSourceOptions['constraints'];
  mode?: RuntimeMode;
  allowFallback?: boolean;
  // Output builders
  produce?: RecorderProduceOptions;
  // Runtime options and hooks
  runtime?: BrowserRuntime; // optional external runtime
  runtimeOptions?: BrowserRuntimeOptions; // used only if runtime not provided
  onStream?: (stream: MediaStream | null) => void;
}

export type RecorderUpdateOptions = Partial<Omit<RecorderOptions, 'runtime' | 'runtimeOptions'>>;

export interface RecordingExports {
  getBlob(): Promise<Blob | null>;
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
  subscribeFrames(handler: (frame: Frame) => void): SubscribeHandle;
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

export const createRecorder = (options: RecorderOptions = {}): Recorder => {
  const runtime = options.runtime ?? createBrowserRuntime(options.runtimeOptions);
  // Build empty pipeline now; configure with plugins on start()
  const pipeline: Pipeline = runtime.createPipeline();

  // Subscriptions
  const vadSubs = new Set<(payload: VADScore) => void>();
  const segSubs = new Set<(payload: Segment) => void>();
  const errSubs = new Set<(payload: CoreError) => void>();
  const rawSubs = new Set<(frame: Frame) => void>();
  const speechSubs = new Set<(frame: Frame) => void>();
  const frameSubs = new Set<(frame: Frame) => void>();
  const readySubs = new Set<() => void>();
  const normalizedBuffer: Frame[] = [];
  const NORMALIZED_BUFFER_LIMIT = 5;
  let framesReady = false;

  let status: RecorderStatus = 'idle';
  let lastError: Error | null = null;
  let source: ReturnType<BrowserRuntime['createMicrophoneSource']> | null = null;
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
  let segmenterSource: RecorderOptions['segmenter'] = options.segmenter;
  let currentStages: StageController[] = [];
  const captureOptions: {
    source?: RecorderSourceOptions;
    format?: RecorderFormatOptions;
    constraints?: MicrophoneSourceOptions['constraints'];
    mode?: RuntimeMode;
    allowFallback?: boolean;
  } = {
    source: options.source,
    format: options.format,
    constraints: options.constraints, // TODO remove legacy constraints after deprecation window
    mode: options.mode,
    allowFallback: options.allowFallback,
  };
  let streamHandler = options.onStream;

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

  const resolveSegmenterInput = (input: RecorderOptions['segmenter']): StageController | null => {
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
    console.log('[recorder] refreshStages', {
      status,
      stageCount: currentStages.length,
      stageIds: currentStages.map((controller) => controller.id),
      segmenter: segmenter ? segmenter.id : 'disabled',
    });
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
  };

  const captureMutators: {
    [K in UpdateKey]?: (value: RecorderUpdateOptions[K]) => void;
  } = {
    source: (value) => {
      captureOptions.source = value;
    },
    format: (value) => {
      captureOptions.format = value;
    },
    constraints: (value) => {
      captureOptions.constraints = value; // TODO remove legacy constraints after deprecation window
    },
    mode: (value) => {
      captureOptions.mode = value;
    },
    allowFallback: (value) => {
      captureOptions.allowFallback = value;
    },
    onStream: (value) => {
      streamHandler = value;
    },
  };

  const update = async (next: RecorderUpdateOptions = {}): Promise<void> => {
    console.log('[recorder] update called');
    pipelineManager.attach();
    const entries = Object.entries(next) as Array<[UpdateKey, RecorderUpdateOptions[UpdateKey]]>;
    let pipelineNeedsRefresh = entries.length === 0;

    const updateKeys = entries.map(([key]) => key);
    console.log('[recorder] update: begin', {
      status,
      keys: updateKeys,
      running: status === 'running',
      stageSources: stageSources.length,
    });

    for (const [key, value] of entries) {
      const pipelineMutator = pipelineMutators[key] as
        | ((input: RecorderUpdateOptions[typeof key]) => boolean)
        | undefined;
      if (pipelineMutator) {
        if (pipelineMutator(value as RecorderUpdateOptions[typeof key])) {
          pipelineNeedsRefresh = true;
        }
      }

      const captureMutator = captureMutators[key] as ((input: RecorderUpdateOptions[typeof key]) => void) | undefined;
      captureMutator?.(value as RecorderUpdateOptions[typeof key]);
    }

    if (pipelineNeedsRefresh) {
      refreshStages();
    }

    console.log('[recorder] update: complete', {
      status,
      reconfigured: pipelineNeedsRefresh ? currentStages.length : 0,
      segmentActive: pipelineManager.isSegmentActive,
    });
  };

  const configure = async (next: RecorderConfigureOptions = {}): Promise<void> => {
    await update(next);
  };

  const start = async (): Promise<void> => {
    console.log('[recorder] start called', { status });
    if (status === 'acquiring' || status === 'running') {
      console.log('[recorder] already acquiring/running, returning');
      return;
    }
    lastError = null;
    setStatus('acquiring');
    normalizedBuffer.length = 0;
    framesReady = false;

    try {
      // Configure pipeline with stages (controllers allow dynamic reconfig)
      refreshStages();
      console.log('[recorder] pipeline configured with', currentStages.length, 'stages');

      console.log('[recorder] creating microphone source', {
        mode: captureOptions.mode,
        allowFallback: captureOptions.allowFallback,
      });
      const sourceOptions: MicrophoneSourceOptions = {
        constraints: deriveConstraintsFromSource(captureOptions.source, captureOptions.constraints),
        mode: captureOptions.mode,
        onStream: streamHandler,
      };
      if (captureOptions.allowFallback !== undefined) {
        sourceOptions.allowFallback = captureOptions.allowFallback;
      }
      source = runtime.createMicrophoneSource(sourceOptions);

      const localSource = source;
      await localSource.start((frame) => {
        assembler.begin(frame.tsMs);
        assembler.onFrame(frame);
        for (const h of rawSubs) h(frame);
        if (pipelineManager.isSegmentActive) {
          for (const h of speechSubs) h(frame);
        }
        const normalized = normalizeFrame(frame, {
          format: captureOptions.format,
          logger: runtime.services.logger,
        });
        bufferNormalizedFrame(normalized);
        for (const h of frameSubs) h(normalized);
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
    const stack = new Error().stack
      ?.split('\n')
      .slice(1, 6)
      .map((line) => line.trim())
      .join(' → ');
    console.log('[recorder] stop called', { status, hasSource: !!source, stack });
    if (status !== 'running' && status !== 'acquiring') {
      console.log('[recorder] not running/acquiring, returning');
      return;
    }
    if (!source) {
      console.log('[recorder] no source, returning');
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
      source = null;
      streamHandler?.(null);
      normalizedBuffer.length = 0;
      framesReady = false;
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
  };

  const wrapRecording = (
    getter: () => { pcm: Int16Array; sampleRate: number; channels: number } | null,
  ): RecordingExports => ({
    async getBlob() {
      const data = getter();
      if (!data) return null;
      const wav = encodeWavPcm16(data.pcm, { sampleRate: data.sampleRate, channels: data.channels });
      // Construct Blob via ArrayBuffer to satisfy TS in both DOM and Node typings
      const buf = new ArrayBuffer(wav.byteLength);
      new Uint8Array(buf).set(wav);
      return new Blob([buf], { type: 'audio/wav' });
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
          handler(cloneFrame(frame));
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
};
