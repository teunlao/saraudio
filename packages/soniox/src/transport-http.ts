import type { WordTimestamp } from '@saraudio/core';
import {
  AuthenticationError,
  ProviderError,
  RateLimitError,
  type TranscriptResult,
  type UrlBuilder,
} from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { buildUrl, mergeHeaders, normalizeHeaders, toArrayBuffer } from '@saraudio/utils';
import { resolveApiKey } from './auth';
import type { SonioxResolvedConfig } from './config';
import type { SonioxHttpTranscriptResponse } from './SonioxHttpTranscriptionModel';

// Minimal batch transcription via Soniox REST API.
// Strategy: POST binary audio to /transcriptions: this endpoint typically accepts body or a file reference.
// We fallback to posting raw with content-type audio/wav or application/octet-stream; caller provides Blob/ArrayBuffer/Uint8Array.

export async function transcribeHTTP(
  resolved: SonioxResolvedConfig,
  audio: Blob | ArrayBuffer | Uint8Array,
  _options?: { language?: string; diarization?: boolean },
  _signal?: AbortSignal,
  logger?: Logger,
): Promise<TranscriptResult> {
  // Build final URL: supports baseUrl string or builder from BaseProviderOptions
  const defaultBase = `${resolved.httpBase.replace(/\/?$/, '')}/transcriptions`;
  const base = resolved.raw.baseUrl;
  const builder: UrlBuilder | undefined = typeof base === 'function' ? base : undefined;
  const baseUrl: string =
    typeof base === 'string' && base.length > 0 ? `${base.replace(/\/?$/, '')}/transcriptions` : defaultBase;
  const params = new URLSearchParams();
  const extra = resolved.raw.query;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v === null || v === undefined) continue;
      params.set(k, String(v));
    }
  }
  const url = builder
    ? await builder({ defaultBaseUrl: defaultBase, params, transport: 'http' })
    : buildUrl(baseUrl, params);
  const token = await resolveApiKey(resolved.raw);

  const body: BodyInit = audio instanceof Blob ? audio : await toArrayBuffer(audio);
  // Baseline headers and user merge (user header form is flexible)
  let headers: Record<string, string> = {
    'content-type': audio instanceof Blob ? audio.type || 'application/octet-stream' : 'application/octet-stream',
  };
  const provided =
    typeof resolved.raw.headers === 'function'
      ? await resolved.raw.headers({ transport: 'http' })
      : resolved.raw.headers;
  if (provided) headers = mergeHeaders(headers, normalizeHeaders(provided));
  // Authorization from auth takes precedence
  headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { method: 'POST', headers, body });
  const contentType = res.headers.get('content-type') || '';
  let model: SonioxHttpTranscriptResponse | null = null;
  if (contentType.includes('application/json')) {
    const parsed = await res.json();
    // Trusting backend contract: assign JSON to strongly-typed model (no casts/guards)
    model = parsed;
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AuthenticationError('Unauthorized');
    }
    if (res.status === 429) {
      const ra = res.headers.get('retry-after');
      const ms = ra ? Number(ra) * 1000 : undefined;
      throw new RateLimitError('Rate limited', ms);
    }
    throw new ProviderError('Soniox HTTP error', 'soniox', undefined, res.status);
  }

  // Map directly according to the declared model (no runtime checks). Use core WordTimestamp.
  const text = model?.text ?? '';
  const tokens = model?.tokens ?? [];
  const words: WordTimestamp[] = tokens.map((t) => {
    const base: WordTimestamp = {
      word: t.text,
      startMs: t.start_ms,
      endMs: t.end_ms,
      confidence: t.confidence,
    };
    return typeof t.speaker === 'number' ? { ...base, speaker: t.speaker } : base;
  });
  const metadata: Record<string, unknown> = JSON.parse(JSON.stringify(model ?? {}));
  logger?.debug?.('soniox http transcribe ok', { module: 'provider-soniox' });
  return { text: String(text), words, metadata };
}
