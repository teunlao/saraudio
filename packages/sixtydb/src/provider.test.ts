import {
  AbortedError,
  AuthenticationError,
  encodeWavPcm16,
  NetworkError,
  ProviderError,
  RateLimitError,
} from '@saraudio/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { sixtydb } from './index';

const wav = () => encodeWavPcm16(new Int16Array([0, 32767, -32768]), { sampleRate: 16000, channels: 1 });
afterEach(() => vi.unstubAllGlobals());

function respond(payload: object, status = 200, headers?: HeadersInit) {
  const mock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), { status, headers }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('60db HTTP provider', () => {
  test('uploads an actual WAV multipart file and maps documented results', async () => {
    const mock = respond({
      request_id: 'req-test',
      text: 'Hello world.',
      language: 'en',
      duration_sec: 1.25,
      words: [{ word: 'Hello', start: 0.1, end: 0.4, confidence: 0.9 }],
      segments: [{ start: 0, end: 1.25, text: 'Hello world.', speakers: [{ speaker: 'SPEAKER_00' }] }],
    });
    const provider = sixtydb({
      auth: { apiKey: 'test-key' },
      language: 'auto',
      diarization: true,
      context: 'Meeting',
      keywords: 'Acme:5',
      headers: { Authorization: 'bad', 'Content-Type': 'bad' },
    });
    const result = await provider.transcribe(wav());
    expect(provider.stream).toBeUndefined();
    expect(provider.capabilities).toMatchObject({
      partials: 'none',
      diarization: 'segment',
      multichannel: false,
      transports: { http: true, websocket: false },
    });
    expect(result).toMatchObject({
      text: 'Hello world.',
      language: 'en',
      span: { startMs: 0, endMs: 1250 },
      words: [{ word: 'Hello', startMs: 100, endMs: 400, confidence: 0.9 }],
      metadata: { request_id: 'req-test', segments: [{ speakers: [{ speaker: 'SPEAKER_00' }] }] },
    });
    const call = mock.mock.calls[0];
    if (!call) throw new Error('missing fetch call');
    const [url, init] = call;
    expect(url).toBe('https://api.60db.ai/stt');
    expect(init?.method).toBe('POST');
    const request = new Request(url, init);
    expect(request.headers.get('authorization')).toBe('Bearer test-key');
    expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    const form = await request.formData();
    expect(form.get('language')).toBeNull();
    expect(form.get('return_timestamps')).toBe('word');
    expect(form.get('include_confidence')).toBe('true');
    expect(form.get('diarize')).toBe('true');
    expect(form.get('context')).toBe('Meeting');
    expect(form.get('keywords')).toBe('Acme:5');
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new Error('missing file');
    expect(file.name).toBe('audio.wav');
    expect(file.type).toBe('audio/wav');
    const bytes = await file.arrayBuffer();
    const header = new DataView(bytes);
    expect(new TextDecoder().decode(new Uint8Array(bytes, 0, 4))).toBe('RIFF');
    expect(header.getUint32(24, true)).toBe(16000);
    expect(header.getUint16(22, true)).toBe(1);
    expect(header.getUint16(34, true)).toBe(16);
    expect(header.getInt16(46, true)).toBe(32767);
    expect(header.getInt16(48, true)).toBe(-32768);
  });

  test('uses latest configuration and per-call language and diarization overrides', async () => {
    const mock = respond({ text: '', language: null, words: [], warning_codes: ['no_speech_detected'] });
    const provider = sixtydb({ auth: { apiKey: 'old' }, language: 'en' });
    const listener = vi.fn();
    const unsubscribe = provider.onUpdate(listener);
    await provider.update({
      auth: { getToken: async () => 'new' },
      language: 'hi',
      diarization: true,
      baseUrl: ({ params }) => `https://proxy.example/stt?${params}`,
      query: { route: 'voice' },
    });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    const result = await provider.transcribe(wav(), { language: 'fr', diarization: false });
    expect(result.text).toBe('');
    expect(result.language).toBeUndefined();
    expect(result.words).toBeUndefined();
    const call = mock.mock.calls[0];
    if (!call) throw new Error('missing fetch call');
    const request = new Request(call[0], call[1]);
    expect(request.url).toBe('https://proxy.example/stt?route=voice');
    expect(request.headers.get('authorization')).toBe('Bearer new');
    const form = await request.formData();
    expect(form.get('language')).toBe('fr');
    expect(form.get('diarize')).toBe('false');
  });

  test('retains encoded Blob type and filename extension', async () => {
    const mock = respond({ text: 'hello' });
    await sixtydb({ auth: { token: 'token' } }).transcribe(new Blob(['encoded-mp3-fixture'], { type: 'audio/mpeg' }));
    const call = mock.mock.calls[0];
    if (!call) throw new Error('missing fetch call');
    const form = await new Request(call[0], call[1]).formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new Error('missing file');
    expect(file.name).toBe('audio.mp3');
    expect(file.type).toBe('audio/mpeg');
  });

  test('falls back to segment words without inventing missing timings or word speakers', async () => {
    respond({
      text: 'Hello',
      segments: [
        {
          start: 0,
          end: 1,
          text: 'Hello',
          words: [{ word: 'Hello', start: 0, end: 1 }, { word: 'untimed' }],
          speakers: [{ speaker: 'SPEAKER_00' }],
        },
      ],
    });
    const result = await sixtydb({ auth: { apiKey: 'key' } }).transcribe(wav());
    expect(result.words).toEqual([{ word: 'Hello', startMs: 0, endMs: 1000, confidence: undefined }]);
    expect(result.span).toBeUndefined();
    expect(result.confidence).toBeUndefined();
  });

  test('rejects raw PCM, empty and oversized input before contacting the API', async () => {
    const mock = respond({ text: 'hello' });
    const provider = sixtydb({ auth: { apiKey: 'key' } });
    await expect(provider.transcribe(new Uint8Array([0, 1, 0, 2]))).rejects.toThrow('WAV container');
    await expect(provider.transcribe(new Uint8Array())).rejects.toThrow('non-empty');
    await expect(provider.transcribe(new Blob([new Uint8Array(10_000_001)], { type: 'audio/wav' }))).rejects.toThrow(
      '10 MB',
    );
    await expect(provider.transcribe(wav(), { responseFormat: 'srt' })).rejects.toThrow('JSON');
    expect(mock).not.toHaveBeenCalled();
  });

  test('rejects missing credentials before contacting the API', async () => {
    const mock = respond({ text: 'hello' });
    await expect(sixtydb({}).transcribe(wav())).rejects.toBeInstanceOf(AuthenticationError);
    expect(mock).not.toHaveBeenCalled();
  });

  test.each([
    [401, AuthenticationError],
    [402, ProviderError],
    [429, RateLimitError],
    [499, AbortedError],
    [503, NetworkError],
  ])('maps HTTP %s without silently retrying uploads', async (status, errorType) => {
    const mock = respond({ success: false, message: 'upstream failed', error_code: 'TEST_ERROR' }, status, {
      'Retry-After': '2',
    });
    const promise = sixtydb({ auth: { apiKey: 'key' } }).transcribe(wav());
    await expect(promise).rejects.toBeInstanceOf(errorType);
    if (status === 429) await expect(promise).rejects.toMatchObject({ retryAfterMs: 2000 });
    expect(mock).toHaveBeenCalledOnce();
  });

  test('rejects application errors and malformed or reversed timing results', async () => {
    const provider = sixtydb({ auth: { apiKey: 'key' } });
    respond({ success: false, message: 'failed' });
    await expect(provider.transcribe(wav())).rejects.toThrow('failed');
    respond({ words: [] });
    await expect(provider.transcribe(wav())).rejects.toThrow('Invalid');
    respond({ text: 'hello', words: [{ word: 'hello', start: 2, end: 1 }] });
    await expect(provider.transcribe(wav())).rejects.toThrow('timestamps');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not JSON')),
    );
    await expect(provider.transcribe(wav())).rejects.toThrow('Invalid');
  });

  test('propagates cancellation before and during fetch as non-retryable aborts', async () => {
    const provider = sixtydb({ auth: { apiKey: 'key' } });
    const aborted = new AbortController();
    aborted.abort();
    const mock = respond({ text: 'hello' });
    await expect(provider.transcribe(wav(), undefined, aborted.signal)).rejects.toBeInstanceOf(AbortedError);
    expect(mock).not.toHaveBeenCalled();
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.signal).toBe(controller.signal);
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      }),
    );
    await expect(provider.transcribe(wav(), undefined, controller.signal)).rejects.toBeInstanceOf(AbortedError);
  });
});
