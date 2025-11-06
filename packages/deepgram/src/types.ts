import type { TranscriptionProvider } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import type { DeepgramLanguageForModel, DeepgramModelId } from './models';
import type { KeywordInput, ReplaceInput } from './url';

/**
 * Deepgram realtime provider options.
 * All fields are typed to match listen v1. Safe defaults and clamps are applied in resolveConfig.
 */
export interface DeepgramOptions<M extends DeepgramModelId = 'nova-3'> {
  /** Deepgram API key (server side). One of `apiKey|token|tokenProvider` is required. */
  apiKey?: string;
  /** Pre‑issued access token. Overrides `apiKey` when provided. */
  token?: string;
  /** Async provider for ephemeral tokens (recommended in browser). */
  tokenProvider?: () => Promise<string>;
  /** Optional structured logger (prefer a child logger). */
  logger?: Logger;
  /** Model identifier (e.g., `nova-3`). Required. */
  model: M;
  /** Explicit base URL (defaults to wss://api.deepgram.com/v1/listen). */
  baseUrl?: string;
  /** Custom URL builder. Receives populated query params and must return the final URL. */
  buildUrl?: (params: URLSearchParams) => string | Promise<string>;
  /** Additional WebSocket subprotocols to send alongside `token` if present. */
  additionalProtocols?: ReadonlyArray<string>;
  /** BCP‑47 language code. Validated against the selected model. */
  language?: DeepgramLanguageForModel<M>;
  /** Enable automatic language detection. */
  detectLanguage?: boolean;
  /** Enable mutable partial results (default true). */
  interimResults?: boolean;
  /** Endpointing window in milliseconds. Set `false` to disable. */
  endpointingMs?: number | false;
  /** Delay before utterance end (ms). */
  utteranceEndMs?: number;
  /** Emit VAD events (`SpeechStarted`/`SpeechEnded`). */
  vadEvents?: boolean;
  /** Enable punctuation and casing. */
  punctuate?: boolean;
  /** Enable profanity filtering. */
  profanityFilter?: boolean;
  /** Enable smart formatting (dates, currency, etc.). */
  smartFormat?: boolean;
  /** Convert spoken numerals to digits. */
  numerals?: boolean;
  /** Convert spoken measurements to shorthand. */
  measurements?: boolean;
  /** Split transcript into paragraphs. */
  paragraphs?: boolean;
  /** Return utterance segmentation. */
  utterances?: boolean;
  /** Enable diarization (speaker attribution). */
  diarize?: boolean;
  /** Force multi‑channel transcription. */
  multichannel?: boolean;
  /** Preferred channel count (default 1). Normalized to 1|2. */
  channels?: 1 | 2;
  /** Preferred sample rate in Hz (default 16000). */
  sampleRate?: number;
  /** Raw audio encoding label (default `linear16`). */
  encoding?: string;
  /** Pin model version (YYYY‑MM‑DD.build). */
  version?: string;
  /** Keyword boosting definitions (array or term→boost map). */
  keywords?: ReadonlyArray<KeywordInput> | Record<string, number>;
  /** Search terms. */
  search?: ReadonlyArray<string>;
  /** Find‑and‑replace rules. */
  replace?: ReplaceInput;
  /** Additional raw query params. null/undefined are skipped. */
  extraQueryParams?: Record<string, string | number | boolean | null | undefined>;
  /** WebSocket keepalive interval in ms. Clamped to [1000..30000]. */
  keepaliveMs?: number;
  /** Backpressure queue budget in ms of audio before dropping oldest frames. Clamped to [100..500]. */
  queueBudgetMs?: number;
}

/** Public Deepgram provider contract for SARAUDIO. */
export type DeepgramProvider = TranscriptionProvider<DeepgramOptions<DeepgramModelId>>;

export type { DeepgramModelId, DeepgramLanguageForModel };
