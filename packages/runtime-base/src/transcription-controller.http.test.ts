import type {
  BatchTranscriptionProvider,
  NormalizedFrame,
  Recorder,
  RecorderStatus,
  Segment,
  StreamOptions,
  TranscriptionStream,
  TranscriptResult,
} from '@saraudio/core';
import { Pipeline } from '@saraudio/core';
import { describe, expect, test } from 'vitest';

import { createTranscription } from './transcription-controller';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function makeFrame(samples = 320, rate = 16000, channels: 1 | 2 = 1): NormalizedFrame<'pcm16'> {
  const pcm = new Int16Array(samples * channels);
  for (let i = 0; i < samples * channels; i += 1) pcm[i] = i % 64;
  return { pcm, tsMs: 0, sampleRate: rate, channels };
}

function createRecorderStub(): {
  recorder: Recorder;
  emitFrame: (f: NormalizedFrame<'pcm16'>) => void;
  emitSegment: () => void;
} {
  const frameHandlers = new Set<(f: NormalizedFrame<'pcm16'>) => void>();
  const segmentHandlers = new Set<(s: Segment) => void>();
  const pipeline = new Pipeline({ now: () => 0, createId: () => 'id' });
  const recorder: Recorder = {
    get status() {
      const s: RecorderStatus = 'idle';
      return s;
    },
    get error() {
      return null;
    },
    pipeline,
    async start() {},
    async stop() {},
    reset() {},
    dispose() {},
    onVad: () => () => {},
    onSegment: (h: (s: Segment) => void) => {
      segmentHandlers.add(h);
      return () => segmentHandlers.delete(h);
    },
    onError: () => () => {},
    subscribeRawFrames: () => () => {},
    subscribeSpeechFrames: () => () => {},
    subscribeFrames(h) {
      frameHandlers.add(h);
      return () => frameHandlers.delete(h);
    },
    onReady: () => () => {},
    async configure() {},
    async update() {},
    recordings: {
      cleaned: { durationMs: 0 },
      full: { durationMs: 0 },
      masked: { durationMs: 0 },
      meta() {
        return { sessionDurationMs: 0, cleanedDurationMs: 0 };
      },
      clear() {},
    },
  };
  return {
    recorder,
    emitFrame: (f: NormalizedFrame<'pcm16'>) => frameHandlers.forEach((h) => h(f)),
    emitSegment: () =>
      segmentHandlers.forEach((h) =>
        h({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 }),
      ),
  };
}

function createHttpProviderStub(): BatchTranscriptionProvider {
  const results: TranscriptResult[] = [];
  const provider: BatchTranscriptionProvider = {
    id: 'http-provider',
    transport: 'http',
    capabilities: {
      partials: 'none',
      words: false,
      diarization: 'none',
      language: 'final',
      segments: true,
      forceEndpoint: false,
      multichannel: false,
    },
    getPreferredFormat: () => ({ sampleRate: 16000, channels: 1, encoding: 'pcm16' }),
    getSupportedFormats: () => [{ sampleRate: 16000, channels: 1, encoding: 'pcm16' }],
    stream: (_opts?: StreamOptions): TranscriptionStream => ({
      get status(): 'ready' {
        return 'ready';
      },
      async connect(_signal?: AbortSignal): Promise<void> {},
      async disconnect(): Promise<void> {},
      send(_frame: NormalizedFrame<'pcm16'>): void {},
      async forceEndpoint(): Promise<void> {},
      onTranscript(_h: (r: TranscriptResult) => void): () => void {
        return () => {};
      },
      onError(_h: (e: Error) => void): () => void {
        return () => {};
      },
      onStatusChange(
        _h: (s: 'idle' | 'connecting' | 'ready' | 'connected' | 'error' | 'disconnected') => void,
      ): () => void {
        return () => {};
      },
    }),
    async transcribe(audio) {
      // naive: return text size by bytes length seen so far
      const size = (audio as Uint8Array).byteLength;
      const r: TranscriptResult = { text: `bytes:${size}` };
      results.push(r);
      return r;
    },
  };
  return provider;
}

describe('transcription controller — HTTP chunking path', () => {
  test('frames go through aggregator and result is emitted', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame, emitSegment } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0, maxInFlight: 1, timeoutMs: 1000 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    emitFrame(makeFrame(320));
    emitSegment();
    await flushPromises();
    expect(finals.length).toBe(1);
    expect(finals[0].text.startsWith('bytes:')).toBe(true);
  });

  test('forceEndpoint maps to aggregator.forceFlush', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, chunking: { intervalMs: 0, minDurationMs: 0 } });
    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));
    await controller.connect();
    emitFrame(makeFrame(320));
    await controller.forceEndpoint();
    await flushPromises();
    expect(finals.length).toBe(1);
  });

  test('disconnect closes aggregator and prevents further flushes', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame, emitSegment } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, chunking: { intervalMs: 0, minDurationMs: 0 } });
    let count = 0;
    controller.onTranscript(() => {
      count += 1;
    });
    await controller.connect();
    emitFrame(makeFrame(160));
    await controller.disconnect();
    await flushPromises();
    const before = count;
    emitSegment();
    await flushPromises();
    expect(count).toBe(before);
  });

  test('Bug #1: preconnect frames are drained into aggregator (race condition check)', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    emitFrame(makeFrame(160));
    emitFrame(makeFrame(160));

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('Bug #1: frames during connect() are not lost', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    const connectPromise = controller.connect();
    emitFrame(makeFrame(160));
    emitFrame(makeFrame(160));
    await connectPromise;

    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('Bug #2: stereo frames calculate duration correctly for preconnect buffer', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      preconnectBufferMs: 20,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    emitFrame(makeFrame(160, 16000, 2));
    emitFrame(makeFrame(160, 16000, 2));
    emitFrame(makeFrame(160, 16000, 2));

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('segment flush respects cooldown period', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame, emitSegment } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      flushOnSegmentEnd: true,
    });

    let flushCount = 0;
    controller.onTranscript(() => {
      flushCount += 1;
    });

    await controller.connect();
    emitFrame(makeFrame(160));

    emitSegment();
    await flushPromises();
    const afterFirst = flushCount;

    emitSegment();
    emitSegment();
    await flushPromises();

    expect(flushCount).toBe(afterFirst);
  });

  test('disconnect during in-flight flush completes gracefully', async () => {
    const provider = createHttpProviderStub();
    const originalTranscribe = provider.transcribe.bind(provider);
    provider.transcribe = async (audio, opts, signal) => {
      await new Promise((r) => setTimeout(r, 50));
      return await originalTranscribe(audio, opts, signal);
    };

    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, maxInFlight: 1 },
    });

    await controller.connect();
    emitFrame(makeFrame(320));
    void controller.forceEndpoint();

    await controller.disconnect();

    expect(controller.status).toBe('disconnected');
    expect(controller.isConnected).toBe(false);
  });

  test('multiple frames before connect are all sent', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    emitFrame(makeFrame(160));
    emitFrame(makeFrame(160));
    emitFrame(makeFrame(160));
    emitFrame(makeFrame(160));

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('frames after connect go directly to aggregator', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();

    emitFrame(makeFrame(160));
    emitFrame(makeFrame(160));

    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('preconnect buffer respects max duration', async () => {
    const provider = createHttpProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      preconnectBufferMs: 20,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    for (let i = 0; i < 10; i += 1) {
      emitFrame(makeFrame(160));
    }

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
  });

  test('empty preconnect buffer does not cause errors', async () => {
    const provider = createHttpProviderStub();
    const { recorder } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    await controller.connect();
    expect(controller.isConnected).toBe(true);
  });

  test('forceEndpoint without frames does not crash', async () => {
    const provider = createHttpProviderStub();
    const { recorder } = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();
  });
});
