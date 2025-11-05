import type { NormalizedFrame, StreamStatus, TranscriptionStream, TranscriptResult, Transport } from '@saraudio/core';
import { AuthenticationError, NetworkError, RateLimitError } from '@saraudio/core';
import { createRecorderStub } from '@saraudio/core/testing';
import type { HttpLiveAggregator, Logger } from '@saraudio/utils';
import { describe, expect, test, vi } from 'vitest';
import {
  createProviderStub,
  createStreamStub,
  createUpdatableProviderStub,
} from '../testing/transcription-provider-stubs';
import { createTranscription } from './transcription-controller';
import * as httpTransportModule from './transports/http-transport';

function makeFrame(): NormalizedFrame<'pcm16'> {
  return {
    pcm: new Int16Array([0, 1, -1, 2, -2]),
    tsMs: 0,
    sampleRate: 16000,
    channels: 1,
  };
}

function makeFrameWithSamples(samples: number): NormalizedFrame<'pcm16'> {
  const arr = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) arr[i] = i % 128;
  return { pcm: arr, tsMs: 0, sampleRate: 16000, channels: 1 };
}

describe('createTranscription controller', () => {
  test('buffers frames before connect resolves and flushes them', async () => {
    const stub = createProviderStub({ reuseStream: true, deferredConnect: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });

    // Start connecting but do not resolve yet
    const pending = controller.connect();

    // Emit a frame while stream is not yet connected
    const buffered = makeFrame();
    recorder.emitNormalizedFrame(buffered);

    // Now resolve connect and await
    stub.streamInstance?.connectDeferred?.resolve();
    await pending;

    // The first frame must be flushed to the stream
    expect(stub.streamInstance?.lastSentFrame).toBe(buffered);
  });

  test('preconnectBufferMs clamps with warning when above soft max', async () => {
    const stub = createProviderStub({ reuseStream: true, deferredConnect: true });
    const recorder = createRecorderStub();

    type WarnRecord = { message: string; context?: Record<string, unknown> };
    const warnings: WarnRecord[] = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: string, context?: Record<string, unknown> | (() => Record<string, unknown>)) => {
        const ctx = typeof context === 'function' ? context() : context;
        warnings.push({ message, context: ctx });
      },
      error: () => {},
      child: () => logger,
    };

    // Create with an excessive buffer to trigger clamp and warning
    createTranscription({ provider: stub.provider, recorder, logger, preconnectBufferMs: 500 });

    expect(warnings.length).toBe(1);
    expect(warnings[0]?.message).toContain('preconnectBufferMs');
    // Pull numbers from context safely
    const provided =
      warnings[0]?.context && typeof (warnings[0].context as Record<string, unknown>).provided === 'number'
        ? ((warnings[0].context as Record<string, unknown>).provided as number)
        : undefined;
    const clampedTo =
      warnings[0]?.context && typeof (warnings[0].context as Record<string, unknown>).clampedTo === 'number'
        ? ((warnings[0].context as Record<string, unknown>).clampedTo as number)
        : undefined;
    expect(provided).toBe(500);
    expect(clampedTo).toBe(250);
  });

  test('preconnectBufferMs clamps negative to 0 with warning', async () => {
    const stub = createProviderStub({ reuseStream: true, deferredConnect: true });
    const recorder = createRecorderStub();
    const warnings: Array<{ message: string }> = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: string) => warnings.push({ message }),
      error: () => {},
      child: () => logger,
    };
    createTranscription({ provider: stub.provider, recorder, logger, preconnectBufferMs: -10 });
    expect(warnings.length).toBe(1);
  });

  test('preconnectBufferMs respected: trims to last frame when budget too small', async () => {
    const stub = createProviderStub({ reuseStream: true, deferredConnect: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder, preconnectBufferMs: 1 });

    const f1 = makeFrameWithSamples(320); // ~20ms
    const f2 = makeFrameWithSamples(320); // ~20ms
    const f3 = makeFrameWithSamples(320); // ~20ms

    const pending = controller.connect();
    recorder.emitNormalizedFrame(f1);
    recorder.emitNormalizedFrame(f2);
    recorder.emitNormalizedFrame(f3);
    stub.streamInstance?.connectDeferred?.resolve();
    await pending;

    expect(stub.streamInstance?.sentFrames.length).toBe(1);
    expect(stub.streamInstance?.sentFrames[0]).toBe(f3);
  });

  test('preconnectBufferMs equal to threshold keeps all frames', async () => {
    const stub = createProviderStub({ reuseStream: true, deferredConnect: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder, preconnectBufferMs: 60 });
    const f1 = makeFrameWithSamples(320); // ~20ms
    const f2 = makeFrameWithSamples(320); // ~20ms
    const f3 = makeFrameWithSamples(320); // ~20ms
    const pending = controller.connect();
    recorder.emitNormalizedFrame(f1);
    recorder.emitNormalizedFrame(f2);
    recorder.emitNormalizedFrame(f3);
    stub.streamInstance?.connectDeferred?.resolve();
    await pending;
    expect(stub.streamInstance?.sentFrames.length).toBe(3);
  });

  test('no frames forwarded after disconnect (unsubscribe works)', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });
    await controller.connect();
    const first = makeFrame();
    recorder.emitNormalizedFrame(first);
    expect(stub.streamInstance?.lastSentFrame).toBe(first);
    await controller.disconnect();
    const after = makeFrame();
    recorder.emitNormalizedFrame(after);
    expect(stub.streamInstance?.lastSentFrame).toBe(first);
  });

  test('connect called twice concurrently performs single stream.connect', async () => {
    const stub = createProviderStub({ reuseStream: true, deferredConnect: true });
    const recorder = createRecorderStub();
    // Wrap stream to count connect calls
    let connectCalls = 0;
    const base = stub.streamInstance;
    if (base) {
      stub.provider.stream = () =>
        ({
          ...base,
          async connect() {
            connectCalls += 1;
            await base.connect();
          },
        }) as unknown as TranscriptionStream;
    }
    const controller = createTranscription({ provider: stub.provider, recorder });
    const p1 = controller.connect();
    const p2 = controller.connect();
    stub.streamInstance?.connectDeferred?.resolve();
    await Promise.all([p1, p2]);
    expect(connectCalls).toBe(1);
  });

  test('maxAttempts enforced: stops after limit', async () => {
    const stub = createProviderStub({ retryPlan: [new NetworkError('a'), new NetworkError('b')] });
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      retry: { maxAttempts: 2, baseDelayMs: 5 },
    });
    await controller.connect();
    expect(controller.isConnected).toBe(false);
    expect(controller.status === 'error' || controller.status === 'disconnected').toBe(true);
  });

  test('onPartial missing does not break wiring', async () => {
    const base = createStreamStub();
    const streamNoPartial: TranscriptionStream = {
      get status() {
        return base.status;
      },
      async connect() {
        await base.connect();
      },
      async disconnect() {
        await base.disconnect();
      },
      send(f) {
        base.send(f);
      },
      async forceEndpoint() {
        await base.forceEndpoint();
      },
      onTranscript: (h) => base.onTranscript(h),
      onError: (h) => base.onError(h),
      onStatusChange: (h) => base.onStatusChange(h),
    };
    const stub = createProviderStub({ reuseStream: true });
    stub.provider.stream = () => streamNoPartial;
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });
    await controller.connect();
    expect(controller.isConnected).toBe(true);
  });
  test('connect/disconnect lifecycle updates status', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });

    expect(controller.status).toBe('idle');
    await controller.connect();
    expect(controller.isConnected).toBe(true);
    expect(controller.status).toBe('connected');

    await controller.disconnect();
    expect(controller.isConnected).toBe(false);
    expect(controller.status).toBe('disconnected');
  });

  test('forwards frames from recorder to stream.send', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });

    await controller.connect();
    const frame = makeFrame();
    recorder.emitNormalizedFrame(frame);

    expect(stub.streamInstance?.lastSentFrame).toBe(frame);
  });

  test('propagates transcript and partial events to subscribers', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });

    const partials: string[] = [];
    const finals: TranscriptResult[] = [];
    controller.onPartial((t: string) => partials.push(t));
    controller.onTranscript((r: TranscriptResult) => finals.push(r));

    await controller.connect();
    stub.streamInstance?.emitPartial('hel');
    stub.streamInstance?.emitTranscript({ text: 'hello' });

    expect(partials).toEqual(['hel']);
    expect(finals).toEqual([{ text: 'hello' }]);
  });

  test('propagates errors and sets error status', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });

    const errors: Error[] = [];
    controller.onError((e: Error) => errors.push(e));

    await controller.connect();
    const boom = new Error('boom');
    stub.streamInstance?.emitError(boom);

    expect(controller.status).toBe('error');
    expect(controller.error).toBe(boom);
    expect(errors).toEqual([boom]);
  });

  test('provider update while disconnected recreates stream on next connect', async () => {
    type UpdateOptions = { revision: number };
    const stub = createUpdatableProviderStub<UpdateOptions>();
    const controller = createTranscription({ provider: stub.provider });

    await controller.connect();
    expect(stub.streams.length).toBe(1);
    await controller.disconnect();

    await stub.provider.update({ revision: 2 });
    expect(stub.streams.length).toBe(1);

    await controller.connect();
    expect(stub.streams.length).toBe(2);

    await controller.disconnect();
  });

  test('provider update while connected defers stream refresh until reconnect and logs notice', async () => {
    type UpdateOptions = { transport: Transport };
    const stub = createUpdatableProviderStub<UpdateOptions>({
      applyOptions: (options, helpers) => {
        helpers.setTransport(options.transport);
      },
    });

    const info = vi.fn();
    const logger: Logger = {
      debug: vi.fn(),
      info,
      warn: vi.fn(),
      error: vi.fn(),
      child: () => logger,
    };

    const controller = createTranscription({ provider: stub.provider, logger });

    await controller.connect();
    expect(stub.streams.length).toBe(1);

    await stub.provider.update({ transport: 'http' });
    expect(stub.streams.length).toBe(1);
    expect(info).toHaveBeenCalledWith('provider updated while connected; changes apply after reconnect', {
      module: 'runtime-base',
      event: 'provider.update',
      providerId: stub.provider.id,
    });

    await controller.disconnect();
    await controller.connect();
    expect(stub.streams.length).toBe(2);

    await controller.disconnect();
  });

  test('HTTP provider update closes aggregator and reinitialises after reconnect', async () => {
    const createHttpTransportSpy = vi.spyOn(httpTransportModule, 'createHttpTransport');
    const aggregators: Array<{
      aggregator: HttpLiveAggregator<TranscriptResult>;
      closeMock: ReturnType<typeof vi.fn>;
    }> = [];
    createHttpTransportSpy.mockImplementation((_options) => {
      const closeMock = vi.fn();
      const aggregator = {
        push: vi.fn(),
        forceFlush: vi.fn(),
        close: closeMock,
        get inFlight() {
          return 0;
        },
      } as HttpLiveAggregator<TranscriptResult>;
      aggregators.push({ aggregator, closeMock });
      return { aggregator };
    });

    try {
      const stub = createUpdatableProviderStub<{ model: string }>({
        transport: 'http',
        transcribe: async () => ({ text: 'ok' }),
      });

      const controller = createTranscription({
        provider: stub.provider,
        chunking: { intervalMs: 10, minDurationMs: 0 },
      });

      await controller.connect();
      expect(aggregators.length).toBe(1);
      expect(aggregators[0].closeMock).not.toHaveBeenCalled();

      await stub.provider.update({ model: 'nova-2' });
      expect(aggregators[0].closeMock).not.toHaveBeenCalled();

      await controller.disconnect();
      expect(aggregators[0].closeMock).toHaveBeenCalledTimes(1);

      await controller.connect();
      expect(aggregators.length).toBe(2);

      await controller.disconnect();
    } finally {
      createHttpTransportSpy.mockRestore();
    }
  });

  test('multiple provider updates queued before reconnect still yield single stream recreation', async () => {
    const stub = createUpdatableProviderStub<{ toggle: boolean }>();

    const controller = createTranscription({ provider: stub.provider });

    await controller.connect();
    expect(stub.streams.length).toBe(1);
    await controller.disconnect();

    await stub.provider.update({ toggle: true });
    await stub.provider.update({ toggle: false });
    expect(stub.streams.length).toBe(1);

    await controller.connect();
    expect(stub.streams.length).toBe(2);

    await controller.disconnect();
  });

  test('forceEndpoint is passed through to stream', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });

    await controller.connect();
    await controller.forceEndpoint();
    expect(stub.streamInstance?.forceEndpointCalls).toBe(1);
  });

  test('flushOnSegmentEnd triggers forceEndpoint when supported', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder, flushOnSegmentEnd: true });

    await controller.connect();
    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 });
    expect(stub.streamInstance?.forceEndpointCalls).toBe(1);
  });

  test('flushOnSegmentEnd no-ops when provider lacks capability', async () => {
    const stub = createProviderStub({ reuseStream: true, capabilities: { forceEndpoint: false } });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder, flushOnSegmentEnd: true });

    await controller.connect();
    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 });
    expect(stub.streamInstance?.forceEndpointCalls).toBe(0);
  });

  test('flushOnSegmentEnd uses cooldown (200ms)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));

    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder, flushOnSegmentEnd: true });
    await controller.connect();

    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 }); // t=0ms
    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 }); // t=0ms again → should be ignored by cooldown
    expect(stub.streamInstance?.forceEndpointCalls).toBe(1);

    vi.setSystemTime(new Date(1201));
    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 }); // t=201ms → passes cooldown
    expect(stub.streamInstance?.forceEndpointCalls).toBe(2);

    vi.useRealTimers();
  });

  test('no force after disconnect', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder, flushOnSegmentEnd: true });

    await controller.connect();
    await controller.disconnect();
    recorder.emitSegment({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 });
    expect(stub.streamInstance?.forceEndpointCalls).toBe(0);
  });

  test('retries on NetworkError and eventually connects', async () => {
    const stub = createProviderStub({ retryPlan: [new NetworkError('net'), 'ok'] });
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      retry: { baseDelayMs: 10, jitterRatio: 0 },
    });
    await controller.connect();
    expect(controller.isConnected).toBe(true);
  });

  test('respects RateLimitError retryAfterMs', async () => {
    const stub = createProviderStub({ retryPlan: [new RateLimitError('rl', 50), 'ok'] });
    const recorder = createRecorderStub();
    const controller = createTranscription({
      provider: stub.provider,
      recorder,
      retry: { baseDelayMs: 5, jitterRatio: 0 },
    });
    await controller.connect();
    expect(controller.isConnected).toBe(true);
  });

  test('does not retry on AuthenticationError', async () => {
    const stub = createProviderStub({ retryPlan: [new AuthenticationError('bad'), 'ok'] });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder, retry: { baseDelayMs: 5 } });
    void controller.connect();
    await new Promise((r) => setTimeout(r, 20));
    expect(controller.isConnected).toBe(false);
  });

  test('cancels retry on disconnect', async () => {
    vi.useFakeTimers();
    const stub = createProviderStub({ retryPlan: [new NetworkError('net'), 'ok'] });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder, retry: { baseDelayMs: 200 } });
    void controller.connect();
    // scheduled retry at 200ms
    await controller.disconnect();
    vi.advanceTimersByTime(500);
    expect(controller.isConnected).toBe(false);
    vi.useRealTimers();
  });

  test('status change events are forwarded', async () => {
    const stub = createProviderStub({ reuseStream: true });
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: stub.provider, recorder });

    const statuses: StreamStatus[] = [];
    controller.onStatusChange((s) => statuses.push(s));

    await controller.connect();
    stub.streamInstance?.emitStatus('ready');

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('ready');
  });
});
