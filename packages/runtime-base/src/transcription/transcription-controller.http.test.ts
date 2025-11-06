import type { NormalizedFrame, TranscriptResult } from '@saraudio/core';
import { createRecorderStub } from '@saraudio/core/testing';
import { describe, expect, test } from 'vitest';
import { createProviderStub } from '../testing/transcription-provider-stubs';
import { createTranscription } from './transcription-controller';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function makeFrame(samples = 320, rate = 16000, channels: 1 | 2 = 1): NormalizedFrame<'pcm16'> {
  const pcm = new Int16Array(samples * channels);
  for (let i = 0; i < samples * channels; i += 1) pcm[i] = i % 64;
  return { pcm, tsMs: 0, sampleRate: rate, channels };
}

function createHttpProviderStub() {
  return createProviderStub({
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
    transcribe: async (audio) => {
      const size = (audio as Uint8Array).byteLength;
      return { text: `bytes:${size}` };
    },
  });
}

describe('transcription controller — HTTP chunking path', () => {
  test('frames go through aggregator and result is emitted (speech-gated)', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, overlapMs: 0, maxInFlight: 1, timeoutMs: 1000 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    // With flushOnSegmentEnd=true controller subscribes to speech frames in HTTP mode
    recorder.emitSpeechFrame(makeFrame(320));
    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 });
    await flushPromises();
    expect(finals.length).toBe(1);
    expect(finals[0].text.startsWith('bytes:')).toBe(true);
  });

  test('forceEndpoint maps to aggregator.forceFlush', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });
    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));
    await controller.connect();
    recorder.emitNormalizedFrame(makeFrame(320));
    await controller.forceEndpoint();
    await flushPromises();
    expect(finals.length).toBe(1);
  });

  test('disconnect closes aggregator and prevents further flushes', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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

  test('segment flush respects cooldown period (speech-gated)', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      flushOnSegmentEnd: true,
    });

    let flushCount = 0;
    controller.onTranscript(() => {
      flushCount += 1;
    });

    await controller.connect();
    // Speech-gated path
    recorder.emitSpeechFrame(makeFrame(160));

    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 });
    await flushPromises();
    const afterFirst = flushCount;

    recorder.emitSegment({ id: 'seg2', startMs: 100, endMs: 200, durationMs: 100, sampleRate: 16000, channels: 1 });
    recorder.emitSegment({ id: 'seg3', startMs: 200, endMs: 300, durationMs: 100, sampleRate: 16000, channels: 1 });
    await flushPromises();

    expect(flushCount).toBe(afterFirst);
  });

  test('HTTP + VAD: silence only does not send (interval=0, segment-only)', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    // Emit only non-speech frames — controller subscribed to speech frames, so aggregator gets nothing
    recorder.emitNormalizedFrame(makeFrame(320));
    // No segment end → nothing should flush
    await flushPromises();
    expect(finals.length).toBe(0);

    // Even forceEndpoint (maps to aggregator.forceFlush) should not yield results if no speech frames were pushed
    await controller.forceEndpoint();
    await flushPromises();
    expect(finals.length).toBe(0);
  });

  test('disconnect during in-flight flush completes gracefully', async () => {
    const stub = createHttpProviderStub();
    if (!stub.provider.transcribe) throw new Error('expected HTTP-capable provider');
    const originalTranscribe = stub.provider.transcribe.bind(stub.provider);
    stub.provider.transcribe = async (audio, opts, signal) => {
      await new Promise((r) => setTimeout(r, 50));
      return await originalTranscribe(audio, opts, signal);
    };

    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    await controller.connect();
    expect(controller.isConnected).toBe(true);
  });

  test('forceEndpoint without frames does not crash', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
    });

    await controller.connect();
    await controller.forceEndpoint();
    await flushPromises();
  });

  test('Bug: frames emitted when aggregator is null are not lost', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    let errorCaught = false;

    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
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

  test('HTTP + VAD: periodic flush during long speech when interval>0', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 5, minDurationMs: 0 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    recorder.emitSpeechFrame(makeFrame(160));
    // Wait for timer-driven flush
    await new Promise((r) => setTimeout(r, 15));
    expect(finals.length).toBeGreaterThanOrEqual(1);
  });

  test('HTTP + VAD: 7s speech (scaled) → two timer flushes + one final by segment end', async () => {
    // Scale: 1 "sec" == 1 ms of audio, sampleRate=1000 Hz ⇒ 1 ms = 1000 samples
    // intervalMs=5 (≈ 3s ticks → 5ms), minDurationMs=5 (need 5ms of audio to allow timer flush)
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 5, minDurationMs: 5 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();

    // Helper: emit "1s" of speech (1 ms scaled) as one frame with 1000 samples
    const oneSecondSpeech = () => {
      const pcm = new Int16Array(1000);
      recorder.emitSpeechFrame({ tsMs: 0, pcm, sampleRate: 1000, channels: 1 });
    };

    // First 3 "seconds" (3 frames): should flush on the next 5ms tick
    oneSecondSpeech();
    oneSecondSpeech();
    oneSecondSpeech();
    await new Promise((r) => setTimeout(r, 7)); // > interval to allow timer to fire
    expect(finals.length).toBe(1);

    // Next 3 "seconds": second timer flush
    oneSecondSpeech();
    oneSecondSpeech();
    oneSecondSpeech();
    await new Promise((r) => setTimeout(r, 7));
    expect(finals.length).toBe(2);

    // Last 1 "second": below minDuration, timer не флашит; сегмент заканчивается → финальный flush
    oneSecondSpeech();
    recorder.emitSegment({ id: 'seg-final', startMs: 0, endMs: 7000, durationMs: 7000, sampleRate: 1000, channels: 1 });
    await flushPromises();
    expect(finals.length).toBe(3);
  });

  test('HTTP + VAD + interval=0: speech without segment end does not flush until forceEndpoint', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    // Emit speech frames but no segment end
    recorder.emitSpeechFrame(makeFrame(320));
    recorder.emitSpeechFrame(makeFrame(320));
    await new Promise((r) => setTimeout(r, 10));
    expect(finals.length).toBe(0);

    await controller.forceEndpoint();
    await flushPromises();
    expect(finals.length).toBe(1);
  });

  test('HTTP + VAD: timer + minDuration gating (no timer flush when speech < minDuration)', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 10, minDurationMs: 50 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    // Emit short speech < minDurationMs (simulate ~40ms total)
    for (let i = 0; i < 2; i += 1) recorder.emitSpeechFrame(makeFrame(320));
    await new Promise((r) => setTimeout(r, 25)); // several timer ticks, still < minDuration
    expect(finals.length).toBe(0);

    // End segment → one final flush
    recorder.emitSegment({ id: 'short', startMs: 0, endMs: 30, durationMs: 30, sampleRate: 16000, channels: 1 });
    await flushPromises();
    expect(finals.length).toBe(1);
  });

  test('HTTP: forceEndpoint queues finalFlushPending during in-flight flush', async () => {
    const stub = createHttpProviderStub();
    if (!stub.provider.transcribe) throw new Error('expected HTTP-capable provider');
    // Delay transcribe to force in-flight overlap
    const original = stub.provider.transcribe.bind(stub.provider);
    let concurrent = 0;
    let maxConcurrent = 0;
    stub.provider.transcribe = async (audio, opts, signal) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      const res = await original(audio, opts, signal);
      concurrent -= 1;
      return res;
    };

    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      chunking: { intervalMs: 0, minDurationMs: 0, maxInFlight: 1 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();
    recorder.emitSpeechFrame(makeFrame(640));
    // Kick off first flush
    void controller.forceEndpoint();
    // While first flush in-flight, request another flush
    recorder.emitSpeechFrame(makeFrame(640));
    void controller.forceEndpoint();
    await new Promise((r) => setTimeout(r, 60));

    expect(finals.length).toBe(2);
    expect(maxConcurrent).toBe(1); // inFlight limit respected
  });

  test('HTTP warn: interval=0 without flushOnSegmentEnd emits config warning', async () => {
    const stub = createHttpProviderStub();
    // Simple logger spy
    const warns: string[] = [];
    const logger = {
      debug() {},
      info() {},
      warn(message: string) {
        warns.push(message);
      },
      error() {},
      child() {
        return this;
      },
    };

    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      logger,
      chunking: { intervalMs: 0, minDurationMs: 0 },
      // flushOnSegmentEnd is intentionally omitted
    });
    await controller.connect();
    expect(warns.some((m) => m.includes('intervalMs=0'))).toBe(true);
  });

  test('HTTP + VAD: after final flush, new phrase first timer flush occurs only after minDuration and on nearest tick', async () => {
    const stub = createHttpProviderStub();
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      // Tick every 10ms; require at least 3000ms of audio (scaled) before timer flush
      chunking: { intervalMs: 10, minDurationMs: 3000 },
      flushOnSegmentEnd: true,
    });

    const finals: TranscriptResult[] = [];
    controller.onTranscript((r) => finals.push(r));

    await controller.connect();

    // Helper: 1 "second" of audio at 1000 Hz (1000 samples)
    const oneSecSpeech = () => {
      const pcm = new Int16Array(1000);
      recorder.emitSpeechFrame({ tsMs: 0, pcm, sampleRate: 1000, channels: 1 });
    };

    // Close a previous phrase to simulate boundary
    oneSecSpeech();
    recorder.emitSegment({ id: 'prev', startMs: 0, endMs: 1000, durationMs: 1000, sampleRate: 1000, channels: 1 });
    await flushPromises();
    expect(finals.length).toBe(1);

    // New phrase starts: 2000ms of audio → below minDuration=3000, даже после нескольких тиков
    oneSecSpeech();
    oneSecSpeech();
    await new Promise((r) => setTimeout(r, 25));
    expect(finals.length).toBe(1); // ничего не ушло

    // Пересекаем minDuration аудио
    oneSecSpeech();
    // До ближайшего тика таймера ничего не уйдёт
    await new Promise((r) => setTimeout(r, 2));
    expect(finals.length).toBe(1);
    // На ближайшем тике получаем первый порционный флаш новой фразы
    await new Promise((r) => setTimeout(r, 12));
    expect(finals.length).toBe(2);
  });
});
