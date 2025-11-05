import {
  AuthenticationError,
  type ProviderCapabilities,
  type RecorderFormatOptions,
  type StreamOptions,
  type TranscriptionProvider,
} from '@saraudio/core';
import type { Logger } from '@saraudio/utils';

import { createDeepgramStream, type DeepgramConnectionInfoFactory } from './stream';

const DEFAULT_BASE_URL = 'wss://api.deepgram.com/v1/listen';
const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_CHANNELS: 1 | 2 = 1;
const DEFAULT_KEEPALIVE_MS = 8_000;
const KEEPALIVE_MIN_MS = 1_000;
const KEEPALIVE_MAX_MS = 30_000;
const DEFAULT_QUEUE_BUDGET_MS = 200;
const QUEUE_MIN_MS = 100;
const QUEUE_MAX_MS = 500;

const CAPABILITIES: ProviderCapabilities = {
  partials: 'mutable',
  words: true,
  diarization: 'word',
  language: 'final',
  segments: true,
  forceEndpoint: false,
  multichannel: true,
  translation: 'none',
};

const SUPPORTED_FORMATS: ReadonlyArray<RecorderFormatOptions> = [
  { sampleRate: 8_000, channels: 1, encoding: 'pcm16' },
  { sampleRate: 8_000, channels: 2, encoding: 'pcm16' },
  { sampleRate: 16_000, channels: 1, encoding: 'pcm16' },
  { sampleRate: 16_000, channels: 2, encoding: 'pcm16' },
  { sampleRate: 22_050, channels: 1, encoding: 'pcm16' },
  { sampleRate: 22_050, channels: 2, encoding: 'pcm16' },
  { sampleRate: 44_100, channels: 1, encoding: 'pcm16' },
  { sampleRate: 44_100, channels: 2, encoding: 'pcm16' },
  { sampleRate: 48_000, channels: 1, encoding: 'pcm16' },
  { sampleRate: 48_000, channels: 2, encoding: 'pcm16' },
];

type KeywordInput =
  | string
  | {
      term: string;
      boost?: number;
    };

type ReplaceInput =
  | ReadonlyArray<{
      search: string;
      replace: string;
    }>
  | Record<string, string>;

export interface DeepgramOptions {
  /** Deepgram API key (server-side) or JWT token. */
  apiKey?: string;
  /** Pre-issued access token. When provided overrides {@link apiKey}. */
  token?: string;
  /** Async provider for ephemeral tokens (recommended for browser). */
  tokenProvider?: () => Promise<string>;
  /** Optional logger (child logger recommended). */
  logger?: Logger;
  /** Primary model identifier (e.g. `nova-2`). */
  model: string;
  /** Optional explicit base URL (defaults to Deepgram listen v1 endpoint). */
  baseUrl?: string;
  /** Custom URL builder. Receives populated query params and must return final URL. */
  buildUrl?: (params: URLSearchParams) => string | Promise<string>;
  /** Additional subprotocols to send alongside token (if any). */
  additionalProtocols?: ReadonlyArray<string>;
  /** Language hint (BCP-47). */
  language?: string;
  /** Enable automatic language detection. */
  detectLanguage?: boolean;
  /** Enable mutable partials. Defaults to `true`. */
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
  /** Enable smart formatting. */
  smartFormat?: boolean;
  /** Convert numerals to digits. */
  numerals?: boolean;
  /** Convert spoken measurements to shorthand. */
  measurements?: boolean;
  /** Split transcript into paragraphs. */
  paragraphs?: boolean;
  /** Return utterance segmentation. */
  utterances?: boolean;
  /** Request diarization. */
  diarize?: boolean;
  /** Force multi-channel transcription. */
  multichannel?: boolean;
  /** Preferred channel count (default 1). */
  channels?: 1 | 2;
  /** Preferred sample rate (Hz). Default 16k. */
  sampleRate?: number;
  /** Raw encoding label expected by Deepgram (default `linear16`). */
  encoding?: string;
  /** Lock model version (YYYY-MM-DD.build). */
  version?: string;
  /** Keyword boosting definitions. */
  keywords?: ReadonlyArray<KeywordInput> | Record<string, number>;
  /** Search terms. */
  search?: ReadonlyArray<string>;
  /** Find-and-replace rules. */
  replace?: ReplaceInput;
  /** Additional raw query parameters. */
  extraQueryParams?: Record<string, string | number | boolean | null | undefined>;
  /** Keepalive interval (ms). */
  keepaliveMs?: number;
  /** Backpressure budget (ms of audio). */
  queueBudgetMs?: number;
}

export interface DeepgramProvider extends TranscriptionProvider {
  readonly id: 'deepgram';
}

export function deepgram(options: DeepgramOptions): DeepgramProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const queueBudgetMs = clamp(options.queueBudgetMs ?? DEFAULT_QUEUE_BUDGET_MS, QUEUE_MIN_MS, QUEUE_MAX_MS);
  const keepaliveMs = clamp(options.keepaliveMs ?? DEFAULT_KEEPALIVE_MS, KEEPALIVE_MIN_MS, KEEPALIVE_MAX_MS);
  const preferredSampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const preferredChannels: 1 | 2 = options.channels ?? (options.multichannel ? 2 : DEFAULT_CHANNELS);
  const baseParams = buildBaseParams({ ...options, sampleRate: preferredSampleRate, channels: preferredChannels });

  const logger = options.logger ? options.logger.child('provider-deepgram') : undefined;

  const connectionFactory: DeepgramConnectionInfoFactory = async () => {
    const params = new URLSearchParams(baseParams);
    const finalUrl = await buildUrl(baseUrl, options.buildUrl, params);
    const token = await resolveAuthToken(options);
    const protocols: string[] | undefined = createProtocolList(token, options.additionalProtocols);
    return { url: finalUrl, protocols };
  };

  const provider: DeepgramProvider = {
    id: 'deepgram',
    transport: 'websocket',
    capabilities: CAPABILITIES,
    tokenProvider: options.tokenProvider,
    getPreferredFormat(): RecorderFormatOptions {
      return { sampleRate: preferredSampleRate, channels: preferredChannels, encoding: 'pcm16' };
    },
    getSupportedFormats(): ReadonlyArray<RecorderFormatOptions> {
      return SUPPORTED_FORMATS;
    },
    negotiateFormat(candidate: RecorderFormatOptions): RecorderFormatOptions {
      const negotiatedSampleRate = candidate.sampleRate ?? preferredSampleRate;
      const negotiatedChannels = normalizeChannels(candidate.channels ?? preferredChannels);
      return {
        sampleRate: negotiatedSampleRate,
        channels: negotiatedChannels,
        encoding: 'pcm16',
      } satisfies RecorderFormatOptions;
    },
    stream(_opts?: StreamOptions) {
      return createDeepgramStream({
        connectionFactory,
        logger,
        keepaliveMs,
        queueBudgetMs,
      });
    },
  };

  return provider;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function normalizeChannels(channels: number): 1 | 2 {
  return channels >= 2 ? 2 : 1;
}

function buildBaseParams(options: DeepgramOptions & { sampleRate: number; channels: 1 | 2 }): URLSearchParams {
  const params = new URLSearchParams();
  params.set('model', options.model);
  params.set('encoding', options.encoding ?? 'linear16');
  params.set('sample_rate', String(options.sampleRate));
  params.set('channels', String(options.channels));
  const multichannel = options.multichannel ?? options.channels > 1;
  if (multichannel) {
    params.set('multichannel', 'true');
  }
  if (options.language) {
    params.set('language', options.language);
  }
  if (options.version) {
    params.set('version', options.version);
  }

  params.set('interim_results', (options.interimResults ?? true) ? 'true' : 'false');
  appendBoolean(params, 'detect_language', options.detectLanguage);
  appendBoolean(params, 'vad_events', options.vadEvents);
  appendBoolean(params, 'punctuate', options.punctuate);
  appendBoolean(params, 'profanity_filter', options.profanityFilter);
  appendBoolean(params, 'smart_format', options.smartFormat);
  appendBoolean(params, 'numerals', options.numerals);
  appendBoolean(params, 'measurements', options.measurements);
  appendBoolean(params, 'paragraphs', options.paragraphs);
  appendBoolean(params, 'utterances', options.utterances);
  appendBoolean(params, 'diarize', options.diarize);

  if (typeof options.endpointingMs === 'number') {
    params.set('endpointing', String(options.endpointingMs));
  } else if (options.endpointingMs === false) {
    params.set('endpointing', 'false');
  }
  if (typeof options.utteranceEndMs === 'number') {
    params.set('utterance_end_ms', String(options.utteranceEndMs));
  }

  if (options.keywords) {
    appendKeywords(params, options.keywords);
  }
  if (options.search?.length) {
    appendList(params, 'search', options.search);
  }
  if (options.replace) {
    appendReplace(params, options.replace);
  }
  if (options.extraQueryParams) {
    appendExtra(params, options.extraQueryParams);
  }

  return params;
}

function appendBoolean(params: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value === undefined) return;
  params.set(key, value ? 'true' : 'false');
}

function appendKeywords(params: URLSearchParams, keywords: ReadonlyArray<KeywordInput> | Record<string, number>): void {
  if (Array.isArray(keywords)) {
    keywords.forEach((entry) => {
      if (typeof entry === 'string') {
        if (entry.length > 0) params.append('keywords', entry);
        return;
      }
      if (entry?.term) {
        const boost = entry.boost ?? 1;
        params.append('keywords', `${entry.term}:${boost}`);
      }
    });
    return;
  }
  Object.entries(keywords).forEach(([term, boost]) => {
    if (term.length === 0) return;
    params.append('keywords', `${term}:${boost}`);
  });
}

function appendList(params: URLSearchParams, key: string, values: ReadonlyArray<string>): void {
  values.forEach((value) => {
    if (value.length === 0) return;
    params.append(key, value);
  });
}

function appendReplace(params: URLSearchParams, replace: ReplaceInput): void {
  if (Array.isArray(replace)) {
    replace.forEach((rule) => {
      if (!rule.search) return;
      params.append('replace', `${rule.search}:${rule.replace ?? ''}`);
    });
    return;
  }
  Object.entries(replace).forEach(([search, replacement]) => {
    if (search.length === 0) return;
    params.append('replace', `${search}:${replacement}`);
  });
}

function appendExtra(
  params: URLSearchParams,
  extra: Record<string, string | number | boolean | null | undefined>,
): void {
  Object.entries(extra).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.set(key, String(value));
  });
}

async function buildUrl(
  baseUrl: string,
  builder: DeepgramOptions['buildUrl'],
  params: URLSearchParams,
): Promise<string> {
  if (builder) {
    const result = await builder(params);
    return result;
  }
  const query = params.toString();
  return query.length > 0 ? `${baseUrl}?${query}` : baseUrl;
}

async function resolveAuthToken(options: DeepgramOptions): Promise<string | null> {
  if (options.tokenProvider) {
    const token = await options.tokenProvider();
    if (!token) {
      throw new AuthenticationError('Deepgram tokenProvider returned an empty token');
    }
    return token;
  }
  if (options.token) {
    if (options.token.length === 0) {
      throw new AuthenticationError('Deepgram token must be non-empty');
    }
    return options.token;
  }
  if (options.apiKey) {
    if (options.apiKey.length === 0) {
      throw new AuthenticationError('Deepgram apiKey must be non-empty');
    }
    return options.apiKey;
  }
  if (hasEmbeddedToken(options)) {
    return null;
  }
  throw new AuthenticationError('Deepgram requires an apiKey, token, or tokenProvider');
}

function hasEmbeddedToken(options: DeepgramOptions): boolean {
  const base = options.baseUrl ?? '';
  if (base.includes('token=') || base.includes('access_token=')) {
    return true;
  }
  const extra = options.extraQueryParams ?? {};
  return ['token', 'access_token', 'key'].some((k) => {
    const value = extra[k];
    return typeof value === 'string' && value.length > 0;
  });
}

function createProtocolList(token: string | null, additional?: ReadonlyArray<string>): string[] | undefined {
  const extra = additional ? [...additional] : [];
  if (token) {
    extra.unshift(token);
    extra.unshift('token');
  }
  return extra.length > 0 ? extra : undefined;
}

export type { DeepgramOptions as DeepgramProviderOptions };
