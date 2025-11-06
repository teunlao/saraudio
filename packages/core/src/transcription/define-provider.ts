import type {
  BaseTranscriptionProvider,
  BatchOptions,
  ProviderCapabilities,
  StreamOptions,
  TranscriptionProvider,
  TranscriptionStream,
  TranscriptResult,
} from './types';
export type Transports = { http: boolean; websocket: boolean };

type RequireHttp<_TOptions> = {
  transcribe: (
    audio: Blob | ArrayBuffer | Uint8Array,
    options?: BatchOptions,
    signal?: AbortSignal,
  ) => Promise<TranscriptResult>;
};

type RequireWs<_TOptions> = {
  stream: (options?: StreamOptions) => TranscriptionStream;
};

type MethodRequirements<TOptions, F extends Transports> = (F['http'] extends true ? RequireHttp<TOptions> : object) &
  (F['websocket'] extends true ? RequireWs<TOptions> : object);

type OptionalMethods<TOptions> = Partial<Pick<TranscriptionProvider<TOptions>, 'stream' | 'transcribe'>>;

/**
 * Define a provider with compile-time transport guarantees and runtime assertions.
 * Does not change the core contract; just helps provider authors return a strictly typed provider.
 */
type CapWithTransports = ProviderCapabilities & { transports: Transports };

export function defineProvider<TOptions, C extends CapWithTransports>(
  impl: BaseTranscriptionProvider<TOptions> & OptionalMethods<TOptions> & { capabilities: C },
): TranscriptionProvider<TOptions> & MethodRequirements<TOptions, C['transports']> {
  // Runtime assertions to keep JS users safe and catch misconfig in tests
  const capabilities = impl.capabilities as C;
  if (capabilities.transports.websocket && typeof (impl as TranscriptionProvider<TOptions>).stream !== 'function') {
    throw new Error('defineProvider: websocket=true but stream() is not implemented');
  }
  if (capabilities.transports.http && typeof (impl as TranscriptionProvider<TOptions>).transcribe !== 'function') {
    throw new Error('defineProvider: http=true but transcribe() is not implemented');
  }
  return impl as TranscriptionProvider<TOptions> & MethodRequirements<TOptions, C['transports']>;
}

export function hasWebSocket<TOptions>(
  p: TranscriptionProvider<TOptions>,
): p is TranscriptionProvider<TOptions> & RequireWs<TOptions> {
  return typeof p.stream === 'function';
}

export function hasHttp<TOptions>(
  p: TranscriptionProvider<TOptions>,
): p is TranscriptionProvider<TOptions> & RequireHttp<TOptions> {
  return typeof p.transcribe === 'function';
}
