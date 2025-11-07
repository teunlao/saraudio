import type { AudioSource, BatchOptions, TranscriptResult } from '@saraudio/core';
import { AuthenticationError, NetworkError, ProviderError, RateLimitError } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { buildTransportUrl, mergeHeaders, normalizeHeaders, parseRetryAfter, toArrayBuffer } from '@saraudio/utils';
import { hasEmbeddedToken, resolveAuthToken } from './auth';
import { type DeepgramResolvedConfig, resolveConfig } from './config';
import type { DeepgramModelId } from './models';
import type { DeepgramOptions } from './types';

const DEFAULT_HTTP_BASE_URL = 'https://api.deepgram.com/v1/listen';

export function resolveHttpConfig<M extends DeepgramModelId>(options: DeepgramOptions<M>): DeepgramResolvedConfig {
  const resolved = resolveConfig(options);
  return { ...resolved };
}

export async function transcribeHTTP(
  options: DeepgramOptions<DeepgramModelId>,
  audio: AudioSource,
  batchOptions?: BatchOptions,
  signal?: AbortSignal,
  logger?: Logger,
): Promise<TranscriptResult> {
  const config = resolveHttpConfig(options);

  const params = new URLSearchParams(config.baseParams);
  if (batchOptions?.responseFormat) {
    params.set('format', batchOptions.responseFormat);
  }
  params.set('interim_results', 'false');
  // extra query params из базовых опций
  if (config.raw.query) {
    Object.entries(config.raw.query).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      params.set(k, String(v));
    });
  }

  const defaultBase = DEFAULT_HTTP_BASE_URL;
  const url = await buildTransportUrl(config.raw.baseUrl, defaultBase, params, 'http');

  const token = await resolveAuthToken({ auth: config.raw.auth, baseUrl: config.raw.baseUrl, query: config.raw.query });
  // Provider baseline headers
  let headers: Record<string, string> = { 'content-type': 'audio/wav' };
  // Merge user headers (supports HeadersInit or record function); user cannot override Authorization set below
  const provided =
    typeof config.raw.headers === 'function' ? await config.raw.headers({ transport: 'http' }) : config.raw.headers;

  if (provided) {
    headers = mergeHeaders(headers, normalizeHeaders(provided));
  }
  if (!hasEmbeddedToken({ auth: config.raw.auth, baseUrl: config.raw.baseUrl, query: config.raw.query }) && token) {
    headers.authorization = chooseAuthScheme(config.raw, token);
  }

  const body = await toArrayBuffer(audio);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body, signal });
  } catch (error) {
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
  if (!parsed) {
    throw new ProviderError('Deepgram HTTP response is empty', 'deepgram', response.status, response.status);
  }
  return mapBatchResult(parsed);
}

function chooseAuthScheme(options: DeepgramOptions<DeepgramModelId>, token: string): string {
  const auth = options.auth;
  if (auth?.apiKey && !auth.token && !auth.getToken) return `Token ${token}`;
  if (auth?.token || auth?.getToken) return `Bearer ${token}`;
  if (token.includes('.')) return `Bearer ${token}`;
  return `Token ${token}`;
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
      if (!isRecord(entry)) return undefined;
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
  if (!results) return undefined;
  const start = readNumber(results.start);
  const end = readNumber(results.end);
  if (start !== undefined && end !== undefined) {
    return { startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) };
  }
  return undefined;
}

function buildMetadata(
  payload: Record<string, unknown>,
  channel: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  const requestId = readString(payload.request_id) ?? readString(getNested(payload, ['metadata', 'request_id']));
  if (requestId) meta.requestId = requestId;
  const channelIndex = channel ? readArray(channel.channel_index) : undefined;
  if (channelIndex) meta.channelIndex = channelIndex;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function readArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.filter((entry): entry is number => typeof entry === 'number');
  return numbers.length > 0 ? numbers : undefined;
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

function getRecordFromArray(list: ReadonlyArray<unknown>, index: number): Record<string, unknown> | undefined {
  const value = list[index];
  return isRecord(value) ? value : undefined;
}

function getNested(source: Record<string, unknown>, path: ReadonlyArray<string>): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}
