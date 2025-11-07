import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SonioxProvider } from './index';
import { soniox } from './index';

type BinaryType = 'blob' | 'arraybuffer';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState: number = MockWebSocket.CONNECTING;
  binaryType: BinaryType = 'blob';
  sent: unknown[] = [];
  private listeners: Map<string, Set<(event: unknown) => void>> = new Map();

  constructor(url: string) {
    this.url = url;
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
});

function createProvider(): SonioxProvider {
  return soniox({ apiKey: 'soniox-test-key', model: 'stt-rt-v3' });
}

async function getSocket(): Promise<MockWebSocket> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await Promise.resolve();
    const socket = MockWebSocket.instances[0];
    if (socket) return socket;
  }
  throw new Error('MockWebSocket instance was not created');
}

function createFrame(samples: number): { pcm: Int16Array; sampleRate: number; channels: 1; tsMs: number } {
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) pcm[i] = i % 32767;
  return { pcm, sampleRate: 16000, channels: 1, tsMs: 0 };
}

describe('soniox provider', () => {
  test('connect sends init json and becomes ready', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('ws stream expected');
    const stream = provider.stream();
    const connectPromise = stream.connect();
    const socket = await getSocket();
    socket.open();
    await connectPromise;
    expect(stream.status).toBe('ready');
    // first sent item must be init JSON
    const first = socket.sent[0];
    expect(typeof first === 'string' && (first as string).includes('"api_key"')).toBe(true);
  });

  test('queue drops on backpressure and flushes on open', async () => {
    const provider = soniox({ apiKey: 'k', model: 'stt-rt-v3', queueBudgetMs: 200 });
    if (!provider.stream) throw new Error('ws stream expected');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();
    // enqueue ~300ms
    stream.send(createFrame(1600));
    stream.send(createFrame(1600));
    stream.send(createFrame(1600));
    socket.open();
    await promise;
    // First element was init JSON; two audio frames should remain
    const abufs = socket.sent.filter((x) => x instanceof ArrayBuffer);
    expect(abufs.length).toBe(2);
  });

  test('parses partial and final tokens', async () => {
    const provider = createProvider();
    if (!provider.stream) throw new Error('ws stream expected');
    const stream = provider.stream();
    const promise = stream.connect();
    const socket = await getSocket();
    const partials: string[] = [];
    const finals: Array<{ text: string }> = [];
    stream.onPartial?.((t) => partials.push(t));
    stream.onTranscript((r) => finals.push({ text: r.text }));
    socket.open();
    await promise;
    socket.emitMessage(
      JSON.stringify({
        tokens: [
          { text: 'hel', is_final: false },
          { text: 'hello', is_final: true, start_ms: 0, end_ms: 500 },
        ],
      }),
    );
    expect(partials).toEqual(['hel']);
    expect(finals).toEqual([{ text: 'hello' }]);
  });

  test('http transcribe maps errors', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      Promise.resolve({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Unauthorized' }),
      } as Response),
    );
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => fetchMock(...args)) as typeof fetch;
    const provider = createProvider();
    await expect(provider.transcribe?.(new Uint8Array([0, 1, 2]))).rejects.toMatchObject({
      name: 'AuthenticationError',
    });
  });
});
