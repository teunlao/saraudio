import type { CoreError, Frame, Pipeline, Segment, Stage, VADScore } from '@saraudio/core';
import { encodeWavPcm16, RecordingAssembler } from '@saraudio/core';
import { createBrowserRuntime } from './runtime';
import type {
  BrowserRuntime,
  BrowserRuntimeOptions,
  MicrophoneSourceOptions,
  RuntimeMode,
  SegmenterFactoryOptions,
} from './types';

export type RecorderStatus = 'idle' | 'acquiring' | 'running' | 'stopping' | 'error';

export interface RecorderProduceOptions {
  cleaned?: boolean; // speech-only concatenated
  full?: boolean; // raw continuous capture
  masked?: boolean; // same length as full, silence → zeros
}

export interface RecorderOptions {
  // Pipeline config
  stages?: Stage[]; // external stages (e.g., VAD, meter)
  segmenter?: SegmenterFactoryOptions | Stage | false;
  // Capture options
  constraints?: MicrophoneSourceOptions['constraints'];
  mode?: RuntimeMode;
  // Output builders
  produce?: RecorderProduceOptions;
  // Runtime options and hooks
  runtime?: BrowserRuntime; // optional external runtime
  runtimeOptions?: BrowserRuntimeOptions; // used only if runtime not provided
  onStream?: (stream: MediaStream | null) => void;
}

export interface SubscribeHandle {
  unsubscribe(): void;
}

export interface RecordingExports {
  getBlob(): Promise<Blob | null>;
  durationMs: number;
}

export interface Recorder {
  readonly status: RecorderStatus;
  readonly error: Error | null;
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
  const runtime = options.runtime ?? createBrowserRuntime(options.runtimeOptions);
  // Important: do NOT pre-build stages with buildStages here, or the runtime will
  // append segmenter twice (once by us and once internally). Pass raw stages + segmenter.
  const pipeline: Pipeline = runtime.createPipeline({
    stages: options.stages ?? [],
    segmenter: options.segmenter ?? {},
  });

  // Subscriptions
  const vadSubs = new Set<(payload: VADScore) => void>();
  const segSubs = new Set<(payload: Segment) => void>();
  const errSubs = new Set<(payload: CoreError) => void>();
  const rawSubs = new Set<(frame: Frame) => void>();
  const speechSubs = new Set<(frame: Frame) => void>();

  let status: RecorderStatus = 'idle';
  let lastError: Error | null = null;
  let source: ReturnType<BrowserRuntime['createMicrophoneSource']> | null = null;
  let assembler = new RecordingAssembler({
    collectCleaned: options.produce?.cleaned ?? true,
    collectFull: options.produce?.full ?? true,
    collectMasked: options.produce?.masked ?? true,
  });
  let segmentActive = false;

  // Attach pipeline listeners
  const offVad = pipeline.events.on('vad', (payload) => {
    for (const h of vadSubs) h(payload);
  });
  const offSegStart = pipeline.events.on('speechStart', () => {
    segmentActive = true;
    assembler.onSpeechStart();
  });
  const offSegEnd = pipeline.events.on('speechEnd', () => {
    segmentActive = false;
    assembler.onSpeechEnd();
  });
  const offSegment = pipeline.events.on('segment', (segment) => {
    assembler.onSegment(segment);
    for (const h of segSubs) h(segment);
  });
  const offError = pipeline.events.on('error', (error) => {
    for (const h of errSubs) h(error);
  });

  const setStatus = (next: RecorderStatus) => {
    status = next;
  };

  const start = async (): Promise<void> => {
    if (status === 'acquiring' || status === 'running') return;
    lastError = null;
    setStatus('acquiring');

    try {
      source = runtime.createMicrophoneSource({
        constraints: options.constraints,
        mode: options.mode,
        onStream: options.onStream,
      });

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
    if (status !== 'running' && status !== 'acquiring') return;
    if (!source) return;
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
      options.onStream?.(null);
    }
  };

  const reset = (): void => {
    assembler = new RecordingAssembler({
      collectCleaned: options.produce?.cleaned ?? true,
      collectFull: options.produce?.full ?? true,
      collectMasked: options.produce?.masked ?? true,
    });
  };

  const dispose = (): void => {
    offVad();
    offSegStart();
    offSegEnd();
    offSegment();
    offError();
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
