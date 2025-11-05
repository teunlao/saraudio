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
}

export interface RequestedFeatures {
  words?: boolean;
  diarization?: boolean;
  language?: boolean;
}

export interface StreamOptions {
  request?: RequestedFeatures;
}

export interface TranscriptionProvider<TOptions = unknown> extends FormatNegotiation {
  readonly id: string;
  readonly transport: Transport;
  /** Optional token provider for browser environments. */
  tokenProvider?: () => Promise<string>;
  readonly capabilities: ProviderCapabilities;
  update(options: TOptions): Promise<void> | void;
  onUpdate(listener: ProviderUpdateListener<TOptions>): () => void;
  stream(options?: StreamOptions): TranscriptionStream;
}

export type AudioSource = Blob | ArrayBuffer | Uint8Array;

export interface BatchOptions {
  language?: string;
  responseFormat?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt' | 'diarized_json';
  diarization?: boolean;
}

export interface BatchTranscriptionProvider<TOptions = unknown> extends TranscriptionProvider<TOptions> {
  transcribe(audio: AudioSource, options?: BatchOptions, signal?: AbortSignal): Promise<TranscriptResult>;
}
