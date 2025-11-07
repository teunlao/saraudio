import type { Logger } from '@saraudio/utils';
import type { NormalizedFrame, RecorderFormatOptions } from '../format';

export type Transport = 'websocket' | 'http';

export type WordTimestamp = {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  /** Speaker index if diarization is available. */
  speaker?: number;
};

export interface TranscriptResult {
  text: string;
  confidence?: number;
  words?: ReadonlyArray<WordTimestamp>;
  language?: string;
  /** Index of the utterance for turn‑based providers (e.g., Flux/AAI). */
  turnId?: number;
  /** Utterance boundaries when the provider exposes them (ms). */
  span?: { startMs: number; endMs: number };
  /** Provider‑specific extras live here to keep the core contract stable. */
  metadata?: Record<string, unknown>;
}

export type StreamStatus = 'idle' | 'connecting' | 'ready' | 'connected' | 'error' | 'disconnected';

export type ProviderUpdateListener<TOptions> = (options: TOptions) => void;

/**
 * Build a final URL for HTTP or WebSocket transports.
 * When provided, takes precedence over simple string baseUrl.
 */
export type UrlBuilder = (ctx: {
  /** Provider's default base URL for the current transport. */
  defaultBaseUrl: string;
  /** Fully populated query params for this request. */
  params: URLSearchParams;
  /** The transport the URL is being built for. */
  transport: Transport;
}) => string | Promise<string>;

/**
 * Minimal, transport-agnostic options that every provider may support.
 * Providers extend this type with their domain-specific configuration.
 */
export interface BaseProviderOptions {
  /**
   * Authentication parameters. Priority: getToken > token > apiKey.
   * - Browser: prefer getToken() for ephemeral tokens.
   * - Server/CLI: apiKey is acceptable.
   */
  auth?: {
    getToken?: () => Promise<string>;
    token?: string;
    apiKey?: string;
  };
  /**
   * Base URL (string) or URL builder callback. Applies to HTTP and WS.
   * If string, params will be appended as a query string.
   */
  baseUrl?: string | UrlBuilder;
  /** Additional query parameters; null/undefined values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /**
   * Extra HTTP headers. In browsers, headers don't apply to native WebSocket.
   * Authorization is derived from auth and should generally not be overridden.
   */
  headers?:
    | Record<string, string>
    | ((ctx: { transport: Transport }) => Record<string, string> | Promise<Record<string, string>>);
  /** Additional WebSocket subprotocols (prepended after provider-specific ones). */
  wsProtocols?: ReadonlyArray<string>;
  /** Optional structured logger (child logger recommended). */
  logger?: Logger;
}

export interface TranscriptionStream {
  readonly status: StreamStatus;
  connect(signal?: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  send(frame: NormalizedFrame<'pcm16'>): void;
  /** Force utterance finalization when provider supports it; otherwise a no‑op. */
  forceEndpoint(): Promise<void>;
  onTranscript(handler: (result: TranscriptResult) => void): () => void;
  onPartial?(handler: (text: string) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  onStatusChange(handler: (status: StreamStatus) => void): () => void;
}

export interface FormatNegotiation {
  getPreferredFormat(): RecorderFormatOptions;
  getSupportedFormats(): ReadonlyArray<RecorderFormatOptions>;
  negotiateFormat?(capabilities: RecorderFormatOptions): RecorderFormatOptions;
}

export interface ProviderCapabilities {
  partials: 'mutable' | 'immutable' | 'turn-only' | 'none';
  words: boolean;
  diarization: 'word' | 'segment' | 'none';
  language: 'stream' | 'final' | 'none';
  segments: boolean;
  forceEndpoint: boolean;
  multichannel: boolean;
  translation?: 'none' | 'one_way' | 'two_way';
  /** Transport support flags: declare whether HTTP and/or WebSocket are supported. */
  transports: { http: boolean; websocket: boolean };
}

export interface RequestedFeatures {
  words?: boolean;
  diarization?: boolean;
  language?: boolean;
}

export interface StreamOptions {
  request?: RequestedFeatures;
}

export type AudioSource = Blob | ArrayBuffer | Uint8Array;

export interface BatchOptions {
  language?: string;
  responseFormat?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt' | 'diarized_json';
  diarization?: boolean;
}

export interface BaseTranscriptionProvider<TOptions = unknown> extends FormatNegotiation {
  readonly id: string;
  /** Optional token provider for browser environments. */
  tokenProvider?: () => Promise<string>;
  /** Capability flags (see also optional transports info below). */
  readonly capabilities: ProviderCapabilities;
  /**
   * Update provider configuration. Implementations should notify listeners via onUpdate.
   */
  update(options: TOptions): Promise<void> | void;
  /** Subscribe to provider updates. */
  onUpdate(listener: ProviderUpdateListener<TOptions>): () => void;
}

/**
 * Unified provider contract. Methods are present only if the provider supports the transport.
 * Runtime users must check for the method presence or rely on controller/hook validation.
 */
export interface TranscriptionProvider<TOptions = unknown> extends BaseTranscriptionProvider<TOptions> {
  /** Present when WebSocket streaming is supported. */
  stream?: (options?: StreamOptions) => TranscriptionStream;
  /** Present when HTTP batch transcription is supported. */
  transcribe?: (audio: AudioSource, options?: BatchOptions, signal?: AbortSignal) => Promise<TranscriptResult>;
}
