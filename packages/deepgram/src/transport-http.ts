import type {
  AudioSource,
  BatchOptions,
  ProviderCapabilities,
  RecorderFormatOptions,
  TranscriptResult,
} from '@saraudio/core';
import { AuthenticationError, NetworkError, ProviderError, RateLimitError } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { hasEmbeddedToken, resolveAuthToken } from './auth';
import { type DeepgramResolvedConfig, normalizeChannels, resolveConfig } from './config';
import { type DeepgramModelId, SUPPORTED_FORMATS } from './models';
import type { HttpTransportStrategy } from './transport-strategy';
import type { DeepgramOptions } from './types';
import { buildUrl } from './url';

const DEFAULT_HTTP_BASE_URL = 'https://api.deepgram.com/v1/listen';

const HTTP_CAPABILITIES: ProviderCapabilities = {
  partials: 'none',
  words: true,
  diarization: 'word',
  language: 'final',
  segments: true,
  forceEndpoint: false,
  multichannel: true,
  translation: 'none',
};

export function createHttpTransport(
  options: DeepgramOptions<DeepgramModelId>,
  getLogger: () => Logger | undefined,
): HttpTransportStrategy {
  let config: DeepgramResolvedConfig = resolveHttpConfig(options);

  return {
    kind: 'http',
    capabilities: HTTP_CAPABILITIES,
    getPreferredFormat(): RecorderFormatOptions {
      return {
        sampleRate: config.sampleRate,
        channels: config.channels,
        encoding: 'pcm16',
      } satisfies RecorderFormatOptions;
    },
    getSupportedFormats(): ReadonlyArray<RecorderFormatOptions> {
      return SUPPORTED_FORMATS;
    },
    negotiateFormat(candidate: RecorderFormatOptions): RecorderFormatOptions {
      const negotiatedSampleRate = candidate.sampleRate ?? config.sampleRate;
      const negotiatedChannels = normalizeChannels(candidate.channels ?? config.channels);
      return {
        sampleRate: negotiatedSampleRate,
        channels: negotiatedChannels,
        encoding: 'pcm16',
      } satisfies RecorderFormatOptions;
    },
    update(nextOptions: DeepgramOptions<DeepgramModelId>) {
      config = resolveHttpConfig(nextOptions);
    },
    rawOptions(): DeepgramOptions<DeepgramModelId> {
      return config.raw;
    },
    tokenProvider(): (() => Promise<string>) | undefined {
      return config.raw.tokenProvider;
    },
    async transcribe(audio: AudioSource, _options: BatchOptions | undefined, signal?: AbortSignal) {
      const params = new URLSearchParams(config.baseParams);
      params.set('interim_results', 'false');
      const url = await buildUrl(config.baseUrl, config.raw.buildUrl, params);

      const token = await resolveAuthToken(config.raw);
      const headers: Record<string, string> = { 'Content-Type': 'audio/wav' };
      if (!hasEmbeddedToken(config.raw) && token) {
        headers.Authorization = chooseAuthScheme(config.raw, token);
      }

      const pcm = await toUint8Array(audio);
      const body = toArrayBufferView(pcm);
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal,
        });
      } catch (error) {
        const logger = getLogger();
        logger?.error('deepgram http request failed', {
          module: 'provider-deepgram-http',
          event: 'fetch-error',
          error: error instanceof Error ? error.message : String(error),
        });
        throw new NetworkError('Deepgram HTTP request failed', true, error);
      }

      const parsed = await parseJson(response);
      if (!response.ok) {
        throw mapHttpError(parsed, response.status, response.headers);
      }
      if (parsed === null) {
        throw new ProviderError('Deepgram HTTP response is empty', 'deepgram', response.status, response.status);
      }
      return mapBatchResult(parsed);
    },
  };
}

function resolveHttpConfig(options: DeepgramOptions<DeepgramModelId>): DeepgramResolvedConfig {
  const resolved = resolveConfig(options);
  const baseUrl = selectBaseUrl(options.baseUrl);
  return {
    ...resolved,
    baseUrl,
  };
}

function selectBaseUrl(custom: string | undefined): string {
  if (typeof custom === 'string' && custom.length > 0) {
    return custom;
  }
  return DEFAULT_HTTP_BASE_URL;
}

function chooseAuthScheme(options: DeepgramOptions<DeepgramModelId>, token: string): string {
  if (options.apiKey && !options.token) {
    return `Token ${token}`;
  }
  if (options.token) {
    return `Bearer ${token}`;
  }
  if (token.includes('.')) {
    return `Bearer ${token}`;
  }
  return `Token ${token}`;
}

async function toUint8Array(source: AudioSource): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    return source;
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  const buffer = await source.arrayBuffer();
  return new Uint8Array(buffer);
}

function toArrayBufferView(view: Uint8Array): ArrayBuffer {
  if (view.buffer instanceof ArrayBuffer && view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
    return view.buffer;
  }
  return view.slice().buffer;
}

async function parseJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }
  try {
    const data = JSON.parse(text);
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

function mapHttpError(payload: Record<string, unknown> | null, status: number, headers: Headers): Error {
  const message = readString(payload?.message) ?? readString(payload?.error) ?? 'Deepgram error';
  if (status === 401 || status === 402 || status === 403) {
    return new AuthenticationError(message, payload ?? {});
  }
  if (status === 429) {
    const retryHeader = headers.get('retry-after');
    return new RateLimitError(message, parseRetryAfter(retryHeader), payload ?? {});
  }
  if (status >= 500) {
    return new ProviderError(message, 'deepgram', status, status, payload ?? {});
  }
  return new ProviderError(message, 'deepgram', status, status, payload ?? {});
}

function mapBatchResult(payload: Record<string, unknown>): TranscriptResult {
  const results = getRecord(payload, 'results');
  const channelsRaw = results ? results.channels : undefined;
  const channels = Array.isArray(channelsRaw) ? channelsRaw : [];
  const firstChannel = getRecordFromArray(channels, 0);
  const alternativesRaw = firstChannel ? firstChannel.alternatives : undefined;
  const alternatives = Array.isArray(alternativesRaw) ? alternativesRaw : [];
  const firstAlt = getRecordFromArray(alternatives, 0);
  const transcript = firstAlt ? (readString(firstAlt.transcript) ?? '') : '';
  const confidence = firstAlt ? readNumber(firstAlt.confidence) : undefined;
  const language = firstAlt ? readString(firstAlt.language) : undefined;
  const words = mapWords(firstAlt ? firstAlt.words : undefined);
  const span = computeSpan(results);
  const metadata = buildMetadata(payload, firstChannel);
  return {
    text: transcript,
    confidence,
    words,
    language,
    span,
    metadata,
  } satisfies TranscriptResult;
}

function mapWords(value: unknown): TranscriptResult['words'] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const mapped = value
    .map((entry) => {
      if (!isRecord(entry)) {
        return undefined;
      }
      const word = readString(entry.punctuated_word) ?? readString(entry.word) ?? '';
      const start = readNumber(entry.start);
      const end = readNumber(entry.end);
      const confidence = readNumber(entry.confidence);
      const speaker = readNumber(entry.speaker);
      return {
        word,
        startMs: start !== undefined ? Math.round(start * 1000) : 0,
        endMs: end !== undefined ? Math.round(end * 1000) : 0,
        confidence,
        speaker,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  return mapped.length > 0 ? mapped : undefined;
}

function computeSpan(results: Record<string, unknown> | undefined): TranscriptResult['span'] {
  if (!results) {
    return undefined;
  }
  const start = readNumber(results.start);
  const end = readNumber(results.end);
  if (start !== undefined && end !== undefined) {
    return {
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
    };
  }
  return undefined;
}

function buildMetadata(
  payload: Record<string, unknown>,
  channel: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  const requestId = readString(payload.request_id) ?? readString(getNested(payload, ['metadata', 'request_id']));
  if (requestId) {
    meta.requestId = requestId;
  }
  const channelIndex = channel ? readArray(channel.channel_index) : undefined;
  if (channelIndex) {
    meta.channelIndex = channelIndex;
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function readArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const numbers = value
    .map((entry) => (typeof entry === 'number' ? entry : undefined))
    .filter((entry): entry is number => entry !== undefined);
  return numbers.length > 0 ? numbers : undefined;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.round(numeric * 1000);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = source[key];
  return isRecord(value) ? value : undefined;
}

function getNested(source: Record<string, unknown>, path: ReadonlyArray<string>): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function getRecordFromArray(list: ReadonlyArray<unknown>, index: number): Record<string, unknown> | undefined {
  const value = list[index];
  return isRecord(value) ? value : undefined;
}
