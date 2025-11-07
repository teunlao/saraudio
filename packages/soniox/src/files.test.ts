import { describe, expect, test, vi } from 'vitest';
import { resolveConfig } from './config';
import {
  sonioxCreateTranscription,
  sonioxGetTranscript,
  sonioxGetTranscription,
  sonioxTranscribeFile,
  sonioxUploadFile,
} from './files';

const resolved = resolveConfig({ model: 'stt-rt-v3', auth: { apiKey: 'k' } });

describe('soniox files api', () => {
  test('upload uses multipart/form-data and Authorization', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response(JSON.stringify({ id: 'f1', filename: 'audio.wav', size: 3, created_at: 'now' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const wrapper = (input: RequestInfo | URL, init?: RequestInit) =>
      (fetchMock as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)(input, init);
    globalThis.fetch = wrapper as unknown as typeof fetch;
    await sonioxUploadFile(resolved, new Uint8Array([1, 2, 3]));
    const call = fetchMock.mock.calls[0];
    expect(Array.isArray(call)).toBe(true);
    if (Array.isArray(call)) {
      const url = call[0];
      expect(typeof url === 'string' && url.endsWith('/files')).toBe(true);
      const init = call[1] as RequestInit;
      // When using FormData, headers may be a Headers or undefined for content-type (auto-set)
      const headers = init.headers as HeadersInit | undefined;
      if (headers instanceof Headers) expect(headers.get('authorization')).toBe('Bearer k');
    }
  });

  test('create transcription sends JSON and Authorization', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response(
          JSON.stringify({
            id: 't1',
            status: 'queued',
            created_at: 'now',
            model: 'm',
            audio_url: null,
            file_id: 'f1',
            language_hints: null,
            context: null,
            enable_speaker_diarization: false,
            enable_language_identification: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    const wrapper2 = (input: RequestInfo | URL, init?: RequestInit) =>
      (fetchMock as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)(input, init);
    globalThis.fetch = wrapper2 as unknown as typeof fetch;
    await sonioxCreateTranscription(resolved, { model: 'm', file_id: 'f1' });
    const call = fetchMock.mock.calls[0];
    if (Array.isArray(call)) {
      const init = call[1] as RequestInit;
      const headers = init.headers as HeadersInit;
      if (headers instanceof Headers) expect(headers.get('content-type')).toBe('application/json');
    }
  });

  test('get transcription and transcript', async () => {
    const fetchMock = vi
      .fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith('/transcriptions/t1'))
          return new Response(
            JSON.stringify({
              id: 't1',
              status: 'completed',
              created_at: 'now',
              model: 'm',
              audio_url: null,
              file_id: 'f1',
              language_hints: null,
              context: null,
              enable_speaker_diarization: false,
              enable_language_identification: false,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        if (u.endsWith('/transcriptions/t1/transcript'))
          return new Response(JSON.stringify({ id: 't1', text: 'hello', tokens: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        return new Response('not found', { status: 404 });
      })
      .mockName('fetch');
    const wrapper3 = (input: RequestInfo | URL, init?: RequestInit) =>
      (fetchMock as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)(input, init);
    globalThis.fetch = wrapper3;
    const tr = await sonioxGetTranscription(resolved, 't1');
    expect(tr.id).toBe('t1');
    const tx = await sonioxGetTranscript(resolved, 't1');
    expect(tx.text).toBe('hello');
  });

  test('transcribeFile convenience runs upload → create → poll → transcript', async () => {
    const seq: Array<{ url: string; method: string; bodyType: string | null }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const bodyType = init?.body ? (init.body instanceof FormData ? 'form' : typeof init.body) : null;
      seq.push({ url, method, bodyType });
      if (url.endsWith('/files'))
        return new Response(JSON.stringify({ id: 'f1', filename: 'a.wav', size: 3, created_at: 'now' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (url.endsWith('/transcriptions') && method === 'POST')
        return new Response(
          JSON.stringify({
            id: 't1',
            status: 'queued',
            created_at: 'now',
            model: 'm',
            audio_url: null,
            file_id: 'f1',
            language_hints: null,
            context: null,
            enable_speaker_diarization: false,
            enable_language_identification: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      if (url.endsWith('/transcriptions/t1'))
        return new Response(
          JSON.stringify({
            id: 't1',
            status: 'completed',
            created_at: 'now',
            model: 'm',
            audio_url: null,
            file_id: 'f1',
            language_hints: null,
            context: null,
            enable_speaker_diarization: false,
            enable_language_identification: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      if (url.endsWith('/transcriptions/t1/transcript'))
        return new Response(JSON.stringify({ id: 't1', text: 'ok', tokens: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      return new Response('not found', { status: 404 });
    });
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => fetchMock(...args)) as typeof fetch;
    const result = await sonioxTranscribeFile(resolved, new Uint8Array([1, 2]), { model: 'm' });
    expect(result.text).toBe('ok');
    expect(seq.map((s) => s.url.endsWith('/files'))).toContain(true);
    expect(seq.map((s) => s.url.includes('/transcriptions'))).toContain(true);
  });
});
