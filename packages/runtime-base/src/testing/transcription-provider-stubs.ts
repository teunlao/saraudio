import type {
  AudioSource,
  BatchOptions,
  NormalizedFrame,
  ProviderCapabilities,
  RecorderFormatOptions,
  StreamOptions,
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
  readonly connectAttempts: number;
}

export interface StreamStubConfig {
  initialStatus?: StreamStatus;
  deferredConnect?: boolean;
  onConnect?: () => void | Promise<void> | never;
}

export function createStreamStub(config: StreamStubConfig = {}): StreamStub {
  const { initialStatus = 'idle', deferredConnect = false, onConnect } = config;
  let status: StreamStatus = initialStatus;
  const onTranscriptHandlers = new Set<(value: TranscriptResult) => void>();
  const onPartialHandlers = new Set<(value: string) => void>();
  const onErrorHandlers = new Set<(value: Error) => void>();
  const onStatusHandlers = new Set<(value: StreamStatus) => void>();
  let lastSentFrame: NormalizedFrame<'pcm16'> | null = null;
  const sentFrames: NormalizedFrame<'pcm16'>[] = [];
  let forceEndpointCalls = 0;
  let connectAttempts = 0;
  let connectDeferred: Deferred<void> | undefined;

  if (deferredConnect) {
    connectDeferred = createDeferred<void>();
  }

  return {
    get status() {
      return status;
    },
    async connect(): Promise<void> {
      connectAttempts += 1;
      if (onConnect) {
        await onConnect();
      }
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
    get connectAttempts() {
      return connectAttempts;
    },
  } satisfies StreamStub;
}

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  partials: 'mutable',
  words: true,
  diarization: 'word',
  language: 'final',
  segments: true,
  forceEndpoint: true,
  multichannel: false,
  transports: { http: true, websocket: true },
};

const DEFAULT_FORMAT: RecorderFormatOptions = { sampleRate: 16000, channels: 1, encoding: 'pcm16' };

/**
 * Universal provider stub configuration.
 * All features are optional - configure only what you need for your test.
 */
export interface ProviderStubConfig<TOptions = unknown> {
  id?: string;
  transport?: Transport;
  capabilities?: Partial<ProviderCapabilities>;
  preferredFormat?: RecorderFormatOptions;

  // Stream behavior
  /** If true, reuses single stream instance. If false, creates new stream on each stream() call */
  reuseStream?: boolean;
  /** Pass to createStreamStub for deferred connect behavior */
  deferredConnect?: boolean;
  /** Custom stream factory - full control over stream creation */
  streamFactory?: (context: { options: TOptions | null; attempt: number }) => StreamStub;

  // Update/reconfigure support
  /** Enable tracking of provider updates */
  trackUpdates?: boolean;
  /** Called when provider.update() is invoked */
  onUpdate?: (options: TOptions) => void | Promise<void>;
  /** Apply update options to provider state (e.g., change transport) */
  applyOptions?: (options: TOptions, helpers: { setTransport: (transport: Transport) => void }) => void | Promise<void>;

  // HTTP/Batch support
  /** Batch transcription function for HTTP providers */
  transcribe?: (audio: AudioSource, options?: BatchOptions, signal?: AbortSignal) => Promise<TranscriptResult>;

  // Retry behavior
  /** Error plan for retry tests: array of errors or 'ok'. Each stream() call consumes next item */
  retryPlan?: Array<Error | 'ok'>;
}

export interface ProviderStub<TOptions = unknown> {
  provider: TranscriptionProvider<TOptions>;
  /** Access single stream instance when reuseStream=true */
  streamInstance: StreamStub | null;
  /** All created streams when reuseStream=false or trackUpdates=true */
  streams: StreamStub[];
  /** Manually trigger update (same as provider.update) */
  emitUpdate: (options: TOptions) => Promise<void>;
  /** Change transport dynamically */
  setTransport: (transport: Transport) => void;
  readonly transport: Transport;
}

export function createProviderStub<TOptions = unknown>(
  config: ProviderStubConfig<TOptions> = {},
): ProviderStub<TOptions> {
  const {
    id = 'provider-stub',
    transport: initialTransport = 'websocket',
    capabilities: capsOverride,
    preferredFormat = DEFAULT_FORMAT,
    reuseStream = false,
    deferredConnect = false,
    streamFactory,
    trackUpdates = false,
    onUpdate,
    applyOptions,
    transcribe,
    retryPlan,
  } = config;

  const capabilities: ProviderCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...(capsOverride ?? {}),
  };

  let currentTransport: Transport = initialTransport;
  let currentOptions: TOptions | null = null;
  const updateListeners = new Set<(options: TOptions) => void>();
  const streams: StreamStub[] = [];
  let streamAttempt = 0;
  const createDefaultTranscript = (): TranscriptResult => ({
    text: '',
    metadata: undefined,
    words: undefined,
    language: undefined,
    span: undefined,
    confidence: undefined,
  });

  const defaultStreamFactory = (): StreamStub => {
    if (retryPlan) {
      const step = retryPlan[Math.min(streamAttempt, retryPlan.length - 1)];
      return createStreamStub({
        deferredConnect,
        onConnect: () => {
          if (step !== 'ok') {
            throw step;
          }
        },
      });
    }
    return createStreamStub({ deferredConnect });
  };

  const createStream = (): StreamStub => {
    const stream = streamFactory
      ? streamFactory({ options: currentOptions, attempt: streamAttempt })
      : defaultStreamFactory();
    streamAttempt += 1;
    if (trackUpdates || !reuseStream) {
      streams.push(stream);
    }
    return stream;
  };

  let singleStreamInstance: StreamStub | null = null;

  const transcribeImpl = async (
    audio: AudioSource,
    options?: BatchOptions,
    signal?: AbortSignal,
  ): Promise<TranscriptResult> => {
    if (transcribe) {
      return await transcribe(audio, options, signal);
    }
    return createDefaultTranscript();
  };

  const emitUpdate = async (options: TOptions): Promise<void> => {
    currentOptions = options;
    if (applyOptions) {
      await applyOptions(options, { setTransport });
    }
    if (onUpdate) {
      await onUpdate(options);
    }
    updateListeners.forEach((listener) => listener(options));
  };

  const buildBase = () => ({
    id,
    capabilities,
    tokenProvider: undefined,
    getPreferredFormat(): RecorderFormatOptions {
      return preferredFormat;
    },
    getSupportedFormats(): ReadonlyArray<RecorderFormatOptions> {
      return [preferredFormat];
    },
    negotiateFormat(candidate: RecorderFormatOptions): RecorderFormatOptions {
      return candidate;
    },
    async update(options: TOptions): Promise<void> {
      await emitUpdate(options);
    },
    onUpdate(listener: (options: TOptions) => void): () => void {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    transcribe: transcribeImpl,
  });

  const buildHttpProvider = (): TranscriptionProvider<TOptions> => ({
    ...buildBase(),
  });

  const buildWsProvider = (): TranscriptionProvider<TOptions> => ({
    ...buildBase(),
    stream(_options?: StreamOptions): TranscriptionStream {
      if (reuseStream) {
        if (!singleStreamInstance) {
          singleStreamInstance = createStream();
        }
        return singleStreamInstance;
      }
      return createStream();
    },
  });

  let provider: TranscriptionProvider<TOptions> = currentTransport === 'http' ? buildHttpProvider() : buildWsProvider();
  if (reuseStream && currentTransport === 'websocket') {
    singleStreamInstance = createStream();
  }

  const rebuildProvider = (): void => {
    provider = currentTransport === 'http' ? buildHttpProvider() : buildWsProvider();
    if (reuseStream && currentTransport === 'websocket' && !singleStreamInstance) {
      singleStreamInstance = createStream();
    }
    if (currentTransport === 'http') {
      singleStreamInstance = null;
    }
  };

  const setTransport = (transport: Transport): void => {
    currentTransport = transport;
    rebuildProvider();
  };

  const stub: ProviderStub<TOptions> = {
    provider,
    get streamInstance() {
      return singleStreamInstance;
    },
    streams,
    emitUpdate: async (options: TOptions) => {
      await provider.update(options);
    },
    setTransport,
    get transport() {
      return currentTransport;
    },
  };

  Object.defineProperty(stub, 'provider', {
    get() {
      return provider;
    },
    set(value: TranscriptionProvider<TOptions>) {
      provider = value;
    },
  });

  return stub;
}

/**
 * Convenience: updatable provider stub (tracks stream creation across updates)
 */
export function createUpdatableProviderStub<TOptions>(
  config: Omit<ProviderStubConfig<TOptions>, 'trackUpdates'> = {},
): ProviderStub<TOptions> {
  return createProviderStub({ ...config, trackUpdates: true });
}
