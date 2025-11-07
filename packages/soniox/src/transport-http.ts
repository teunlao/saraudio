import type { WordTimestamp } from '@saraudio/core';
import { AuthenticationError, ProviderError, RateLimitError, type TranscriptResult } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
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
  const base = resolved.httpBase.replace(/\/?$/, '');
  const url = `${base}/transcriptions`;
  const token = await resolveApiKey(resolved.raw);

  let body: BodyInit;
  if (audio instanceof Blob) {
    body = audio;
  } else if (audio instanceof Uint8Array) {
    const copy = new Uint8Array(audio.byteLength);
    copy.set(audio);
    body = copy.buffer;
  } else if (audio instanceof ArrayBuffer) {
    body = audio;
  } else {
    throw new ProviderError('Unsupported audio payload for Soniox HTTP', 'soniox');
  }
  const headers: HeadersInit = {
    // Soniox REST commonly uses Bearer auth
    Authorization: `Bearer ${token}`,
    'content-type': audio instanceof Blob ? audio.type || 'application/octet-stream' : 'application/octet-stream',
  };

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
