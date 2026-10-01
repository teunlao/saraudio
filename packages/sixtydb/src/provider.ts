import type { BaseProviderOptions, TranscriptionProvider, TranscriptResult } from '@saraudio/core';
import {
  AbortedError,
  AuthenticationError,
  defineProvider,
  NetworkError,
  ProviderError,
  RateLimitError,
} from '@saraudio/core';
import { buildTransportUrl, parseRetryAfter, toArrayBuffer } from '@saraudio/utils';
import { z } from 'zod';

export interface SixtyDBOptions extends Omit<BaseProviderOptions, 'wsProtocols'> {
  language?: string;
  diarization?: boolean;
  /** Plain-text REST context, not the WebSocket context object. */
  context?: string;
  /** CSV vocabulary, with optional :weight per term. */
  keywords?: string;
}

export type SixtyDBProvider = TranscriptionProvider<SixtyDBOptions> & {
  transcribe: NonNullable<TranscriptionProvider<SixtyDBOptions>['transcribe']>;
};

const wordSchema = z
  .object({
    word: z.string(),
    start: z.number().nonnegative().optional(),
    end: z.number().nonnegative().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .passthrough();
const segmentSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    text: z.string(),
    words: z.array(wordSchema).optional(),
  })
  .passthrough();
const responseSchema = z
  .object({
    text: z.string(),
    language: z.string().nullable().optional(),
    duration_sec: z.number().nonnegative().optional(),
    words: z.array(wordSchema).optional(),
    segments: z.array(segmentSchema).optional(),
  })
  .passthrough();
const errorSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
    error_code: z.string().optional(),
  })
  .passthrough();
const MAX_FILE_BYTES = 10_000_000;

/** HTTP batch only; the runtime supplies WAV containers for its PCM chunks. */
export function sixtydb(options: SixtyDBOptions): SixtyDBProvider {
  let config = options;
  const listeners = new Set<(options: SixtyDBOptions) => void>();
  return defineProvider({
    id: 'sixtydb',
    capabilities: {
      partials: 'none',
      words: true,
      diarization: 'segment',
      language: 'final',
      segments: true,
      forceEndpoint: false,
      multichannel: false,
      translation: 'none',
      transports: { http: true, websocket: false },
    },
    getPreferredFormat() {
      return { encoding: 'pcm16', sampleRate: 16000, channels: 1 } as const;
    },
    getSupportedFormats() {
      return [{ encoding: 'pcm16', sampleRate: 16000, channels: 1 }] as const;
    },
    update(next: SixtyDBOptions) {
      config = next;
      listeners.forEach((listener) => listener(next));
    },
    onUpdate(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async transcribe(audio, batchOptions, signal) {
      const current = config;
      checkAborted(signal);
      if (
        batchOptions?.responseFormat &&
        !['json', 'verbose_json', 'diarized_json'].includes(batchOptions.responseFormat)
      ) {
        throw new ProviderError('60db supports JSON responses only', 'sixtydb');
      }
      const size = audio instanceof Blob ? audio.size : audio.byteLength;
      if (size === 0 || size > MAX_FILE_BYTES) {
        throw new ProviderError('60db requires a non-empty audio file under 10 MB', 'sixtydb');
      }
      const file = await audioFile(audio);
      const token = current.auth?.getToken
        ? await current.auth.getToken()
        : (current.auth?.token ?? current.auth?.apiKey);
      if (!token?.trim()) throw new AuthenticationError('60db requires auth.apiKey, auth.token, or auth.getToken');
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(current.query ?? {})) {
        if (value != null) params.set(key, String(value));
      }
      const url = await buildTransportUrl(current.baseUrl, 'https://api.60db.ai/stt', params, 'http');
      const provided =
        typeof current.headers === 'function' ? await current.headers({ transport: 'http' }) : current.headers;
      const headers = new Headers(provided);
      // fetch must supply the multipart boundary; credentials beat user headers.
      headers.delete('content-type');
      headers.set('authorization', `Bearer ${token}`);
      const body = new FormData();
      body.set('file', file.blob, file.name);
      const language = batchOptions?.language ?? current.language;
      if (language && language !== 'auto') body.set('language', language);
      body.set('return_timestamps', 'word');
      body.set('include_confidence', 'true');
      const diarization = batchOptions?.diarization ?? current.diarization;
      if (diarization !== undefined) body.set('diarize', String(diarization));
      if (current.context !== undefined) body.set('context', current.context);
      if (current.keywords !== undefined) body.set('keywords', current.keywords);
      checkAborted(signal);
      let response: Response;
      let payload: unknown;
      try {
        response = await fetch(url, { method: 'POST', headers, body, signal });
        const text = await response.text();
        try {
          payload = JSON.parse(text);
        } catch {
          payload = undefined;
        }
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          throw new AbortedError('60db transcription aborted', error);
        }
        throw new NetworkError('60db HTTP request failed', true, error);
      }
      checkAborted(signal);
      const error = errorSchema.safeParse(payload);
      if (!response.ok || (error.success && error.data.success === false)) {
        const message = error.success
          ? (error.data.message ?? '60db transcription failed')
          : '60db transcription failed';
        if (response.status === 401 || response.status === 403) throw new AuthenticationError(message);
        if (response.status === 429)
          throw new RateLimitError(message, parseRetryAfter(response.headers.get('retry-after')));
        if (response.status === 499) throw new AbortedError(message);
        if (response.status >= 500) throw new NetworkError(message, true);
        throw new ProviderError(message, 'sixtydb', error.success ? error.data.error_code : undefined, response.status);
      }
      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success)
        throw new ProviderError('Invalid 60db transcription response', 'sixtydb', undefined, response.status);
      return mapResult(parsed.data);
    },
  });
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortedError('60db transcription aborted', signal.reason);
}

async function audioFile(audio: Blob | ArrayBuffer | Uint8Array): Promise<{ blob: Blob; name: string }> {
  if (audio instanceof Blob && audio.type && audio.type !== 'application/octet-stream') {
    const extensions: Record<string, string> = {
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'm4a',
      'video/mp4': 'mp4',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
      'audio/webm': 'webm',
    };
    const extension = extensions[audio.type.split(';')[0]];
    if (!extension) throw new ProviderError('Unsupported 60db audio file type', 'sixtydb');
    return { blob: audio, name: `audio.${extension}` };
  }
  const bytes = await toArrayBuffer(audio);
  const header = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength));
  if (
    header.length < 12 ||
    new TextDecoder().decode(header.subarray(0, 4)) !== 'RIFF' ||
    new TextDecoder().decode(header.subarray(8, 12)) !== 'WAVE'
  ) {
    throw new ProviderError(
      '60db byte input must be a WAV container; encode PCM with encodeWavPcm16 or pass a typed audio Blob',
      'sixtydb',
    );
  }
  return { blob: new Blob([bytes], { type: 'audio/wav' }), name: 'audio.wav' };
}

function mapResult(payload: z.infer<typeof responseSchema>): TranscriptResult {
  const candidates = payload.words?.length
    ? payload.words
    : payload.segments?.flatMap((segment) => segment.words ?? []);
  const words: NonNullable<TranscriptResult['words']>[number][] = [];
  for (const entry of candidates ?? []) {
    if (entry.start === undefined || entry.end === undefined) continue;
    if (entry.end < entry.start) throw new ProviderError('Invalid 60db word timestamps', 'sixtydb');
    words.push({
      word: entry.word,
      startMs: Math.round(entry.start * 1000),
      endMs: Math.round(entry.end * 1000),
      confidence: entry.confidence,
    });
  }
  return {
    text: payload.text,
    language: payload.language ?? undefined,
    words: words.length ? words : undefined,
    span:
      payload.duration_sec === undefined ? undefined : { startMs: 0, endMs: Math.round(payload.duration_sec * 1000) },
    metadata: payload,
  };
}
