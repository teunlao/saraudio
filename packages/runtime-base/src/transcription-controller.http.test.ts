import type {
  BatchTranscriptionProvider,
  NormalizedFrame,
  StreamOptions,
  TranscriptionStream,
  TranscriptResult,
} from '@saraudio/core';
import { createRecorderStub } from '@saraudio/core/testing';
import { describe, expect, test } from 'vitest';

import { createTranscription } from './transcription-controller';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function makeFrame(samples = 320, rate = 16000, channels: 1 | 2 = 1): NormalizedFrame<'pcm16'> {
  const pcm = new Int16Array(samples * channels);
  for (let i = 0; i < samples * channels; i += 1) pcm[i] = i % 64;
  return { pcm, tsMs: 0, sampleRate: rate, channels };
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
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0, maxInFlight: 1, timeoutMs: 1000 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(320));
    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 });
    await flushPromises();
    expect(finals.length).toBe(1);
    expect(finals[0].text.startsWith('bytes:')).toBe(true);
  });

  test('forceEndpoint maps to aggregator.forceFlush', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider, recorder, chunking: { intervalMs: 0, minDurationMs: 0 } });
    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));
    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(320));
    await controller.forceEndpoint();
    await flushPromises();
    expect(finals.length).toBe(1);
  });

  test('disconnect closes aggregator and prevents further flushes', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider, recorder, chunking: { intervalMs: 0, minDurationMs: 0 } });
    let count = 0;
    controller.onTranscript(() => {
      count += 1;
    });
    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(160));
    await controller.disconnect();
    await flushPromises();
    const before = count;
    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 });
    await flushPromises();
    expect(count).toBe(before);
  });

  test('Bug #1: preconnect frames are drained into aggregator (race condition check)', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    recorder.emitNormalizedFrame(makeFrame(160));
    recorder.emitNormalizedFrame(makeFrame(160));

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('Bug #1: frames during connect() are not lost', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    const connectPromise = controller.connect();
    recorder.emitNormalizedFrame(makeFrame(160));
    recorder.emitNormalizedFrame(makeFrame(160));
    await connectPromise;

    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('Bug #2: stereo frames calculate duration correctly for preconnect buffer', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      preconnectBufferMs: 20,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    recorder.emitNormalizedFrame(makeFrame(160, 16000, 2));
    recorder.emitNormalizedFrame(makeFrame(160, 16000, 2));
    recorder.emitNormalizedFrame(makeFrame(160, 16000, 2));

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('segment flush respects cooldown period', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
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
    recorder.emitNormalizedFrame(makeFrame(160));

    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 });
    await flushPromises();
    const afterFirst = flushCount;

    recorder.emitSegment({ id: 'seg2', startMs: 100, endMs: 200, durationMs: 100, sampleRate: 16000, channels: 1 });
    recorder.emitSegment({ id: 'seg3', startMs: 200, endMs: 300, durationMs: 100, sampleRate: 16000, channels: 1 });
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

    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, maxInFlight: 1 },
    });

    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(320));
    void controller.forceEndpoint();

    await controller.disconnect();

    expect(controller.status).toBe('disconnected');
    expect(controller.isConnected).toBe(false);
  });

  test('multiple frames before connect are all sent', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    recorder.emitNormalizedFrame(makeFrame(160));
    recorder.emitNormalizedFrame(makeFrame(160));
    recorder.emitNormalizedFrame(makeFrame(160));
    recorder.emitNormalizedFrame(makeFrame(160));

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('frames after connect go directly to aggregator', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();

    recorder.emitNormalizedFrame(makeFrame(160));
    recorder.emitNormalizedFrame(makeFrame(160));

    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
    const size = Number.parseInt(finals[0].text.split(':')[1], 10);
    expect(size).toBeGreaterThan(0);
  });

  test('preconnect buffer respects max duration', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      preconnectBufferMs: 20,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    for (let i = 0; i < 10; i += 1) {
      recorder.emitNormalizedFrame(makeFrame(160));
    }

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(1);
  });

  test('empty preconnect buffer does not cause errors', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
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
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();
  });

  test('Bug: frames emitted when aggregator is null are not lost', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(160));
    await controller.disconnect();
    await flushPromises();

    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(160));
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBeGreaterThan(0);
  });

  test('Bug: frames are not silently lost when aggregator is null', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    let errorCaught = false;

    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    controller.onError(() => {
      errorCaught = true;
    });

    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(160));
    await controller.disconnect();
    recorder.emitNormalizedFrame(makeFrame(160));
    await flushPromises();

    expect(errorCaught).toBe(false);
  });

  test('After disconnect, frames are ignored (not buffered)', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(160));
    await controller.disconnect();
    await flushPromises();

    const afterDisconnect = finals.length;

    recorder.emitNormalizedFrame(makeFrame(160));
    recorder.emitNormalizedFrame(makeFrame(160));
    await flushPromises();

    expect(finals.length).toBe(afterDisconnect);
  });

  test('Reconnect after disconnect subscribes anew (no old frames)', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(160));
    await controller.disconnect();

    recorder.emitNormalizedFrame(makeFrame(160));
    await flushPromises();

    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(160));
    await controller.forceEndpoint();
    await flushPromises();

    expect(finals.length).toBe(2);
  });

  test('Bug: double await in connect does not cause issues', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    const start = Date.now();
    await controller.connect();
    const duration = Date.now() - start;

    expect(controller.isConnected).toBe(true);
    expect(duration).toBeLessThan(100);
  });

  test('No double subscription across repeated connect/disconnect', async () => {
    const provider = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    await controller.connect();
    const subscribersAfterFirstConnect = recorder.normalizedFrameHandlers.size;
    await controller.disconnect();
    await controller.connect();
    const subscribersAfterReconnect = recorder.normalizedFrameHandlers.size;

    expect(subscribersAfterFirstConnect).toBe(1);
    expect(subscribersAfterReconnect).toBe(1);
  });
});
