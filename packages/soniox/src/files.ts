import type { TranscriptResult } from '@saraudio/core';
import { AuthenticationError, ProviderError, RateLimitError } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { buildUrl, mergeHeaders, normalizeHeaders, toArrayBuffer } from '@saraudio/utils';

import { resolveApiKey } from './auth';
import type { SonioxResolvedConfig } from './config';
import type {
  SonioxHttpCreateTranscriptionRequest,
  SonioxHttpTranscriptionResource,
  SonioxHttpTranscriptResponse,
  SonioxHttpUploadFileResponse,
} from './SonioxHttpTranscriptionModel';

/** Build Soniox REST base URL for a given path (uses resolved.httpBase). */
function buildBase(resolved: SonioxResolvedConfig, path: string): string {
  const base = resolved.httpBase.replace(/\/?$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Upload raw audio bytes as a file to Soniox Files API. Returns file id. */
export async function sonioxUploadFile(
  resolved: SonioxResolvedConfig,
  audio: Blob | ArrayBuffer | Uint8Array,
  opts?: { filename?: string; headers?: HeadersInit },
  logger?: Logger,
): Promise<SonioxHttpUploadFileResponse> {
  const url = buildBase(resolved, '/files');
  const token = await resolveApiKey(resolved.raw);

  // When sending FormData, do NOT set content-type manually — let the browser/runtime set boundary.
  const form = new FormData();
  const filename = opts?.filename ?? 'audio.wav';
  const body = audio instanceof Blob ? audio : new Blob([await toArrayBuffer(audio)], { type: 'application/octet-stream' });
  form.append('file', body, filename);

  let headers: Record<string, string> = {};
  const provided = opts?.headers;
  if (provided) headers = mergeHeaders(headers, normalizeHeaders(provided));
  headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { method: 'POST', body: form, headers });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AuthenticationError('Unauthorized');
    if (res.status === 429) {
      const ra = res.headers.get('retry-after');
      const ms = ra ? Number(ra) * 1000 : undefined;
      throw new RateLimitError('Rate limited', ms);
    }
    const text = await res.text().catch(() => '');
    logger?.error('soniox upload failed', { module: 'provider-soniox', status: res.status, text });
    throw new ProviderError('Soniox upload error', 'soniox', undefined, res.status);
  }
  return (await res.json()) as SonioxHttpUploadFileResponse;
}

/** Create a transcription job for a given file id or audio URL. */
export async function sonioxCreateTranscription(
  resolved: SonioxResolvedConfig,
  request: SonioxHttpCreateTranscriptionRequest,
  headersInit?: HeadersInit,
): Promise<SonioxHttpTranscriptionResource> {
  const url = buildBase(resolved, '/transcriptions');
  const token = await resolveApiKey(resolved.raw);
  let headers: Record<string, string> = { 'content-type': 'application/json' };
  if (headersInit) headers = mergeHeaders(headers, normalizeHeaders(headersInit));
  headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(request) });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AuthenticationError('Unauthorized');
    if (res.status === 429) {
      const ra = res.headers.get('retry-after');
      const ms = ra ? Number(ra) * 1000 : undefined;
      throw new RateLimitError('Rate limited', ms);
    }
    throw new ProviderError('Soniox create transcription error', 'soniox', undefined, res.status);
  }
  return (await res.json()) as SonioxHttpTranscriptionResource;
}

/** Get transcription job resource by id. */
export async function sonioxGetTranscription(
  resolved: SonioxResolvedConfig,
  id: string,
  headersInit?: HeadersInit,
): Promise<SonioxHttpTranscriptionResource> {
  const url = buildBase(resolved, `/transcriptions/${encodeURIComponent(id)}`);
  const token = await resolveApiKey(resolved.raw);
  let headers: Record<string, string> = {};
  if (headersInit) headers = mergeHeaders(headers, normalizeHeaders(headersInit));
  headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) throw new ProviderError('Soniox get transcription error', 'soniox', undefined, res.status);
  return (await res.json()) as SonioxHttpTranscriptionResource;
}

/** Retrieve finalized transcript (text/tokens) for a job id. */
export async function sonioxGetTranscript(
  resolved: SonioxResolvedConfig,
  id: string,
  headersInit?: HeadersInit,
): Promise<SonioxHttpTranscriptResponse> {
  const url = buildBase(resolved, `/transcriptions/${encodeURIComponent(id)}/transcript`);
  const token = await resolveApiKey(resolved.raw);
  let headers: Record<string, string> = {};
  if (headersInit) headers = mergeHeaders(headers, normalizeHeaders(headersInit));
  headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) throw new ProviderError('Soniox get transcript error', 'soniox', undefined, res.status);
  return (await res.json()) as SonioxHttpTranscriptResponse;
}

/**
 * Convenience: upload → create job → poll until completed → fetch transcript → map to TranscriptResult.
 * Not used by live path; suitable for batch flows.
 */
export async function sonioxTranscribeFile(
  resolved: SonioxResolvedConfig,
  audio: Blob | ArrayBuffer | Uint8Array,
  request: Omit<SonioxHttpCreateTranscriptionRequest, 'file_id' | 'audio_url'> & { filename?: string },
  logger?: Logger,
): Promise<TranscriptResult> {
  const upload = await sonioxUploadFile(resolved, audio, { filename: request.filename }, logger);
  const job = await sonioxCreateTranscription(resolved, { model: request.model, file_id: upload.id, language_hints: request.language_hints });
  // Simple polling; in real apps consider webhooks.
  let current = job;
  const start = Date.now();
  while (current.status !== 'completed' && current.status !== 'error') {
    // basic backoff
    const waited = Date.now() - start;
    const sleep = Math.min(1000 + Math.floor(waited / 10), 5000);
    await new Promise((r) => setTimeout(r, sleep));
    current = await sonioxGetTranscription(resolved, job.id);
  }
  if (current.status !== 'completed') {
    throw new ProviderError(`Soniox job failed: ${current.error_message ?? 'unknown'}`, 'soniox');
  }
  const tr = await sonioxGetTranscript(resolved, job.id);
  const tokens = tr.tokens ?? [];
  return {
    text: tr.text ?? '',
    words: tokens.map((t) => ({ word: t.text, startMs: t.start_ms, endMs: t.end_ms, confidence: t.confidence })),
    metadata: { id: tr.id },
  } satisfies TranscriptResult;
}

