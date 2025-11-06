import { AuthenticationError, ProviderError, RateLimitError, type TranscriptResult } from '@saraudio/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { DeepgramProvider } from './index';
import { deepgram } from './index';

type BinaryType = 'blob' | 'arraybuffer';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly protocols?: string[];
  readyState: number = MockWebSocket.CONNECTING;
  binaryType: BinaryType = 'blob';
  sent: unknown[] = [];
  private listeners: Map<string, Set<(event: unknown) => void>> = new Map();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = Array.isArray(protocols) ? [...protocols] : protocols ? [protocols] : undefined;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type);
    set?.delete(listener);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSING;
    this.dispatch('close', { code, reason, wasClean: true });
    this.readyState = MockWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch('open', { type: 'open' });
  }

  emitMessage(data: string): void {
    this.dispatch('message', { data });
  }

  emitClose(code: number, reason: string, wasClean = false): void {
    this.readyState = MockWebSocket.CLOSING;
    this.dispatch('close', { code, reason, wasClean });
    this.readyState = MockWebSocket.CLOSED;
  }

  emitError(): void {
    this.dispatch('error', { type: 'error' });
  }

  private dispatch(type: string, event: unknown): void {
    const set = this.listeners.get(type);
    if (!set) return;
    set.forEach((listener) => listener(event));
  }
}

type MutableGlobal = typeof globalThis & { WebSocket: typeof WebSocket };

const mutableGlobal = globalThis as MutableGlobal;
const originalWebSocket = mutableGlobal.WebSocket;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  MockWebSocket.instances = [];
  mutableGlobal.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  mutableGlobal.WebSocket = originalWebSocket;
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

function createFrame(samples: number): { pcm: Int16Array; sampleRate: number; channels: 1; tsMs: number } {
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) {
    pcm[i] = i % 32767;
  }
  return {
    pcm,
    sampleRate: 16_000,
    channels: 1,
    tsMs: 0,
  } satisfies { pcm: Int16Array; sampleRate: number; channels: 1; tsMs: number };
}

function createProvider(): DeepgramProvider {
  return deepgram({
    apiKey: 'test-key',
    model: 'nova-2',
    language: 'en-US',
    keepaliveMs: 8_000,
    queueBudgetMs: 200,
  });
}

async function getSocket(): Promise<MockWebSocket> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await Promise.resolve();
    const socket = MockWebSocket.instances[0];
    if (socket) return socket;
  }
  throw new Error('MockWebSocket instance was not created');
}

describe('deepgram provider', () => {
  test('connect builds URL and uses token protocol', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();
    expect(socket.url).toContain('model=nova-2');
    expect(socket.url).toContain('language=en-US');
    expect(socket.protocols).toEqual(['token', 'test-key']);
    socket.open();
    await promise;
    expect(stream.status).toBe('ready');
  });

  test('queue drops oldest frame when over budget', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const connectPromise = stream.connect();
    const socket = await getSocket();

    const frameA = createFrame(1_600); // 100ms
    const frameB = createFrame(1_600);
    const frameC = createFrame(1_600);

    stream.send(frameA);
    stream.send(frameB);
    stream.send(frameC);

    socket.open();
    await connectPromise;

    expect(socket.sent).toHaveLength(2);
    const sentFramesLengths = socket.sent
      .map((value) => (value instanceof ArrayBuffer ? new Int16Array(value).length : 0))
      .filter((length) => length > 0);
    expect(sentFramesLengths).toEqual([frameB.pcm.length, frameC.pcm.length]);
  });

  test('emits partial and final transcripts', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();

    const partials: string[] = [];
    const finals: TranscriptResult[] = [];

    stream.onPartial?.((text) => partials.push(text));
    stream.onTranscript((result) => finals.push(result));

    socket.open();
    await promise;

    socket.emitMessage(
      JSON.stringify({
        type: 'Results',
        channel: { alternatives: [{ transcript: 'hello', words: [] }] },
        is_final: false,
      }),
    );

    socket.emitMessage(
      JSON.stringify({
        type: 'Results',
        channel: {
          alternatives: [
            {
              transcript: 'hello world',
              confidence: 0.92,
              language: 'en-US',
              words: [
                { word: 'hello', start: 0, end: 0.5, confidence: 0.9 },
                { word: 'world', start: 0.5, end: 1.0, confidence: 0.91 },
              ],
            },
          ],
        },
        is_final: true,
        start: 0,
        end: 1,
        channel_index: [0],
        metadata: { request_id: 'req-1', detected_language: 'en' },
      }),
    );

    expect(partials).toEqual(['hello']);
    expect(finals).toHaveLength(1);
    const result = finals[0];
    expect(result.text).toBe('hello world');
    expect(result.words?.length).toBe(2);
    expect(result.words?.[0]?.startMs).toBe(0);
    expect(result.words?.[1]?.endMs).toBe(1000);
    expect(result.language).toBe('en-US');
  });

  test('maps close reason to authentication error', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();

    const errors: Error[] = [];
    stream.onError((error) => errors.push(error));

    socket.open();
    await promise;

    socket.emitClose(1008, JSON.stringify({ err_code: 401, err_msg: 'Unauthorized' }), false);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toBeInstanceOf(AuthenticationError);
  });

  test('sends keepalive at configured interval', async () => {
    vi.useFakeTimers();
    const provider = createProvider();
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();

    socket.open();
    await promise;

    vi.advanceTimersByTime(8_000);
    expect(socket.sent).toContain('{"type":"KeepAlive"}');
  });

  test('uses custom URL builder when provided', async () => {
    const provider = deepgram({
      apiKey: 'test-key',
      model: 'nova-2',
      language: 'en-US',
      buildUrl: (params) => `wss://example.test/listen?${params.toString()}&custom=1`,
    });
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();
    expect(socket.url.startsWith('wss://example.test/listen?')).toBe(true);
    expect(socket.url).toContain('custom=1');
    socket.open();
    await promise;
  });

  test('tokenProvider supplies token via subprotocols', async () => {
    const provider = deepgram({ tokenProvider: async () => 'jwt-token', model: 'nova-2', language: 'en-US' });
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();
    expect(socket.protocols).toEqual(['token', 'jwt-token']);
    socket.open();
    await promise;
  });

  test('keepalive is clamped to minimum interval (1000ms)', async () => {
    vi.useFakeTimers();
    const provider = deepgram({ apiKey: 'test-key', model: 'nova-2', language: 'en-US', keepaliveMs: 500 });
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();
    socket.open();
    await promise;
    const before = socket.sent.length;
    vi.advanceTimersByTime(999);
    expect(socket.sent.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(socket.sent).toContain('{"type":"KeepAlive"}');
  });

  test('maps 429 close reason to RateLimitError with retryAfter', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();

    const errors: Error[] = [];
    stream.onError((e) => errors.push(e));

    socket.open();
    await promise;

    socket.emitClose(1008, JSON.stringify({ status: 429, retry_after: '1500', err_msg: 'Too many requests' }), false);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors[0] as { name: string; retryAfterMs?: number };
    expect(err.name).toBe('RateLimitError');
    expect(err.retryAfterMs).toBe(1500);
  });

  test('connect can be aborted via AbortSignal', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const ac = new AbortController();
    ac.abort();
    await expect(stream.connect(ac.signal)).rejects.toMatchObject({ name: 'AbortedError' });
    expect(MockWebSocket.instances.length).toBe(0);
  });

  test('close code 1006 yields NetworkError', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('expected websocket-capable provider');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();

    const errors: Error[] = [];
    stream.onError((e) => errors.push(e));

    // close before open, not clean
    socket.emitClose(1006, '', false);
    await expect(promise).rejects.toBeTruthy();
    expect(errors[0]?.name).toBe('NetworkError');
  });

  // Deepgram supports HTTP; transcribe should succeed when fetch responds OK.
  test('http transcribe succeeds with mocked fetch', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  alternatives: [
                    {
                      transcript: 'hello http',
                      confidence: 0.88,
                      words: [
                        { word: 'hello', start: 0, end: 0.5, confidence: 0.9 },
                        { word: 'http', start: 0.5, end: 1, confidence: 0.88 },
                      ],
                    },
                  ],
                },
              ],
            },
            metadata: { request_id: 'req-http' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    globalThis.fetch = (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => fetchMock(...args);

    const provider = deepgram({ apiKey: 'test-key', model: 'nova-2', language: 'en-US' });
    const result = await provider.transcribe?.(new Uint8Array([0, 1, 2]));
    expect(result?.text).toBe('hello http');
  });

  test('http transport transcribe succeeds', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response(
          JSON.stringify({
            request_id: 'req-123',
            results: {
              channels: [
                {
                  channel_index: [0],
                  alternatives: [
                    {
                      transcript: 'hello http',
                      confidence: 0.9,
                      language: 'en-US',
                      words: [
                        { word: 'hello', start: 0, end: 0.5, confidence: 0.9 },
                        { word: 'http', start: 0.5, end: 1, confidence: 0.88 },
                      ],
                    },
                  ],
                },
              ],
              start: 0,
              end: 1,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    globalThis.fetch = (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => fetchMock(...args);

    const provider = deepgram({ apiKey: 'test-key', model: 'nova-2', language: 'en-US' });
    if (!provider.transcribe) throw new Error('expected http-capable provider');
    const result = await provider.transcribe(new Uint8Array([0, 1, 2]));

    expect(result.text).toBe('hello http');
    expect(result.metadata && typeof result.metadata === 'object').toBe(true);

    const call = fetchMock.mock.calls[0];
    expect(Array.isArray(call)).toBe(true);
    if (Array.isArray(call)) {
      const first = call[0];
      expect(typeof first === 'string' && first.startsWith('https://')).toBe(true);
      const init = call[1];
      if (isRequestInit(init)) {
        const auth = readAuthorization(init.headers);
        expect(auth).toBe('Token test-key');
      } else {
        throw new Error('Request init is missing');
      }
    }
  });

  test('http transport maps authentication error', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => fetchMock(...args);

    const provider = deepgram({ apiKey: 'bad-key', model: 'nova-2', language: 'en-US' });
    await expect(provider.transcribe?.(new Uint8Array([1]))).rejects.toBeInstanceOf(AuthenticationError);
  });

  test('http transport maps rate limit error', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response(JSON.stringify({ error: 'Too Many Requests' }), {
          status: 429,
          headers: { 'retry-after': '2' },
        }),
    );
    globalThis.fetch = (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => fetchMock(...args);

    const provider = deepgram({ apiKey: 'test-key', model: 'nova-2', language: 'en-US' });
    await expect(provider.transcribe?.(new Uint8Array([1]))).rejects.toSatisfy((error) => {
      return error instanceof RateLimitError && error.retryAfterMs === 2000;
    });
  });

  test('http transport uses Bearer when tokenProvider returns JWT', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response(JSON.stringify({ results: { channels: [] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => fetchMock(...args);

    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const provider = deepgram({ tokenProvider: async () => jwt, model: 'nova-2', language: 'en-US' });
    await provider.transcribe?.(new Uint8Array([1]));
    const call = fetchMock.mock.calls[0];
    if (Array.isArray(call)) {
      const init = call[1];
      if (isRequestInit(init)) {
        const auth = readAuthorization(init.headers);
        expect(auth).toBe(`Bearer ${jwt}`);
      }
    }
  });

  // No transport field anymore; controller decides transport. Provider exposes both methods.
});

function isRequestInit(value: unknown): value is RequestInit {
  return typeof value === 'object' && value !== null;
}

function readAuthorization(headers: HeadersInit | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get('authorization') ?? headers.get('Authorization') ?? undefined;
  }
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && entry.length >= 2 && entry[0].toLowerCase() === 'authorization') {
        const value = entry[1];
        return typeof value === 'string' ? value : undefined;
      }
    }
    return undefined;
  }
  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'authorization' && typeof value === 'string') {
        return value;
      }
    }
  }
  return undefined;
}
