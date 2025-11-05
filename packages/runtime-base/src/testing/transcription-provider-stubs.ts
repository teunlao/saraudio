import type {
  AudioSource,
  BatchOptions,
  NormalizedFrame,
  ProviderCapabilities,
  RecorderFormatOptions,
  StreamStatus,
  TranscriptionProvider,
  TranscriptionStream,
  TranscriptResult,
  Transport,
} from '@saraudio/core';
import { createDeferred, type Deferred } from '@saraudio/utils';

export interface StreamStub extends TranscriptionStream {
  emitTranscript(result: TranscriptResult): void;
  emitPartial(text: string): void;
  emitError(error: Error): void;
  emitStatus(status: StreamStatus): void;
  readonly lastSentFrame: NormalizedFrame<'pcm16'> | null;
  readonly sentFrames: ReadonlyArray<NormalizedFrame<'pcm16'>>;
  readonly forceEndpointCalls: number;
  readonly connectDeferred?: Deferred<void>;
}

export function createStreamStub(initialStatus: StreamStatus = 'idle', withDeferredConnect = false): StreamStub {
  let status: StreamStatus = initialStatus;
  const onTranscriptHandlers = new Set<(value: TranscriptResult) => void>();
  const onPartialHandlers = new Set<(value: string) => void>();
  const onErrorHandlers = new Set<(value: Error) => void>();
  const onStatusHandlers = new Set<(value: StreamStatus) => void>();
  let lastSentFrame: NormalizedFrame<'pcm16'> | null = null;
  const sentFrames: NormalizedFrame<'pcm16'>[] = [];
  let forceEndpointCalls = 0;
  let connectDeferred: Deferred<void> | undefined;

  if (withDeferredConnect) {
    connectDeferred = createDeferred<void>();
  }

  return {
    get status() {
      return status;
    },
    async connect(): Promise<void> {
      if (connectDeferred) {
        await connectDeferred.promise;
      }
    },
    async disconnect(): Promise<void> {
      // no-op in stub
    },
    send(frame: NormalizedFrame<'pcm16'>): void {
      lastSentFrame = frame;
      sentFrames.push(frame);
    },
    async forceEndpoint(): Promise<void> {
      forceEndpointCalls += 1;
    },
    onTranscript(handler: (value: TranscriptResult) => void): () => void {
      onTranscriptHandlers.add(handler);
      return () => onTranscriptHandlers.delete(handler);
    },
    onPartial(handler: (value: string) => void): () => void {
      onPartialHandlers.add(handler);
      return () => onPartialHandlers.delete(handler);
    },
    onError(handler: (value: Error) => void): () => void {
      onErrorHandlers.add(handler);
      return () => onErrorHandlers.delete(handler);
    },
    onStatusChange(handler: (value: StreamStatus) => void): () => void {
      onStatusHandlers.add(handler);
      return () => onStatusHandlers.delete(handler);
    },
    emitTranscript(result: TranscriptResult): void {
      onTranscriptHandlers.forEach((handler) => handler(result));
    },
    emitPartial(text: string): void {
      onPartialHandlers.forEach((handler) => handler(text));
    },
    emitError(error: Error): void {
      onErrorHandlers.forEach((handler) => handler(error));
    },
    emitStatus(next: StreamStatus): void {
      status = next;
      onStatusHandlers.forEach((handler) => handler(next));
    },
    get lastSentFrame() {
      return lastSentFrame;
    },
    get sentFrames() {
      return sentFrames;
    },
    get forceEndpointCalls() {
      return forceEndpointCalls;
    },
    get connectDeferred() {
      return connectDeferred;
    },
  } satisfies StreamStub;
}

export interface UpdatableProviderStubConfig<TOptions> {
  id?: string;
  transport?: Transport;
  capabilities?: Partial<ProviderCapabilities>;
  preferredFormat?: RecorderFormatOptions;
  streamFactory?: (input: { options: TOptions | null }) => StreamStub;
  applyOptions?: (options: TOptions, helpers: { setTransport: (transport: Transport) => void }) => void | Promise<void>;
  transcribe?: (audio: AudioSource, options?: BatchOptions, signal?: AbortSignal) => Promise<TranscriptResult>;
}

export interface UpdatableProviderStub<TOptions> {
  provider: TranscriptionProvider<TOptions>;
  streams: StreamStub[];
  emitUpdate(options: TOptions): Promise<void>;
  setTransport(transport: Transport): void;
  readonly transport: Transport;
}

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  partials: 'mutable',
  words: true,
  diarization: 'word',
  language: 'final',
  segments: true,
  forceEndpoint: true,
  multichannel: false,
};

const DEFAULT_FORMAT: RecorderFormatOptions = { sampleRate: 16000, channels: 1, encoding: 'pcm16' };

export function createUpdatableProviderStub<TOptions>(
  config: UpdatableProviderStubConfig<TOptions> = {},
): UpdatableProviderStub<TOptions> {
  const listeners = new Set<(options: TOptions) => void>();
  const streams: StreamStub[] = [];
  let currentTransport: Transport = config.transport ?? 'websocket';
  let currentOptions: TOptions | null = null;

  const setTransport = (transport: Transport) => {
    currentTransport = transport;
  };

  const capabilities: ProviderCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...(config.capabilities ?? {}),
  };

  const preferredFormat = config.preferredFormat ?? DEFAULT_FORMAT;

  const provider: TranscriptionProvider<TOptions> = {
    id: config.id ?? 'updatable-provider-stub',
    get transport() {
      return currentTransport;
    },
    capabilities,
    getPreferredFormat: () => preferredFormat,
    getSupportedFormats: () => [preferredFormat],
    stream: () => {
      const stream = config.streamFactory?.({ options: currentOptions }) ?? createStreamStub();
      streams.push(stream);
      return stream;
    },
    async update(options: TOptions) {
      currentOptions = options;
      if (config.applyOptions) {
        await config.applyOptions(options, { setTransport });
      }
      listeners.forEach((listener) => listener(options));
    },
    onUpdate(listener: (options: TOptions) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...(config.transcribe
      ? {
          transcribe: config.transcribe,
        }
      : {}),
  };

  return {
    provider,
    streams,
    emitUpdate: async (options: TOptions) => {
      await provider.update(options);
    },
    setTransport,
    get transport() {
      return currentTransport;
    },
  };
}
