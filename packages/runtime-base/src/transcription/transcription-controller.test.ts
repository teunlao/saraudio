import type {
  NormalizedFrame,
  ProviderCapabilities,
  Recorder,
  RecorderFormatOptions,
  RecorderStatus,
  Segment,
  StreamStatus,
  TranscriptionProvider,
  TranscriptionStream,
  TranscriptResult,
  Transport,
} from '@saraudio/core';
import { AuthenticationError, NetworkError, Pipeline, RateLimitError } from '@saraudio/core';
import type { HttpLiveAggregator, Logger } from '@saraudio/utils';
import { describe, expect, test, vi } from 'vitest';
import {
  createStreamStub,
  createUpdatableProviderStub,
  type StreamStub,
} from '../testing/transcription-provider-stubs';
import { createTranscription } from './transcription-controller';
import * as httpTransportModule from './transports/http-transport';

function preferredFormat(): RecorderFormatOptions {
  return { sampleRate: 16000, channels: 1, encoding: 'pcm16' };
}

type Handler<T> = (value: T) => void;

interface ProviderStub extends TranscriptionProvider {
  streamInstance: StreamStub;
}

function createProviderStub(opts?: { deferredConnect?: boolean }): ProviderStub {
  const caps: ProviderCapabilities = {
    partials: 'mutable',
    words: true,
    diarization: 'word',
    language: 'final',
    segments: true,
    forceEndpoint: true,
    multichannel: false,
  };
  const streamInstance = createStreamStub('idle', opts?.deferredConnect === true);
  const provider: ProviderStub = {
    id: 'mock-provider',
    transport: 'websocket',
    capabilities: caps,
    getPreferredFormat: preferredFormat,
    getSupportedFormats: () => [preferredFormat()],
    negotiateFormat: (rec) => ({ ...rec }),
    update: () => {
      // no-op for tests
    },
    onUpdate: () => () => {},
    stream: () => streamInstance,
    streamInstance,
  };
  return provider;
}

// Provider that fails connect N-1 times with given error(s), then succeeds
function createRetryingProviderStub(plan: Array<Error | 'ok'>): ProviderStub {
  const caps: ProviderCapabilities = {
    partials: 'mutable',
    words: true,
    diarization: 'word',
    language: 'final',
    segments: true,
    forceEndpoint: true,
    multichannel: false,
  };
  let attempt = 0;
  const provider: ProviderStub = {
    id: 'retry-provider',
    transport: 'websocket',
    capabilities: caps,
    getPreferredFormat: preferredFormat,
    getSupportedFormats: () => [preferredFormat()],
    update: () => {
      // no-op for tests
    },
    onUpdate: () => () => {},
    negotiateFormat: (rec) => ({ ...rec }),
    stream: () => {
      const s = createStreamStub();
      const step = plan[Math.min(attempt, plan.length - 1)];
      const originalConnect = s.connect.bind(s);
      s.connect = async () => {
        attempt += 1;
        if (step === 'ok') return originalConnect();
        throw step;
      };
      return s;
    },
    // not used directly in tests
    streamInstance: createStreamStub(),
  };
  return provider;
}

function createRecorderStub(): {
  recorder: Recorder;
  emitFrame: (f: NormalizedFrame<'pcm16'>) => void;
  emitSegment: (s?: Segment) => void;
} {
  // Trackers
  const frameHandlers = new Set<Handler<NormalizedFrame<'pcm16'>>>();
  const readyHandlers = new Set<() => void>();
  const segmentHandlers = new Set<Handler<Segment>>();

  const pipeline = new Pipeline({ now: () => 0, createId: () => 'id' });

  const recorder: Recorder = {
    // State
    get status(): RecorderStatus {
      return 'idle';
    },
    get error(): Error | null {
      return null;
    },
    pipeline,
    // Lifecycle
    async start() {},
    async stop() {},
    reset() {},
    dispose() {},
    // Subscriptions
    onVad: () => () => {},
    onSegment: (h) => {
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
    onReady(h) {
      readyHandlers.add(h);
      return () => readyHandlers.delete(h);
    },
    // Config
    async configure() {},
    async update() {},
    // Recordings (not used by controller; keep minimal shape)
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

  const emitFrame = (f: NormalizedFrame<'pcm16'>) => {
    frameHandlers.forEach((h) => h(f));
  };
  const emitSegment = (s?: Segment) => {
    const payload: Segment =
      s ?? ({ id: 'seg', startMs: 0, endMs: 100, durationMs: 100, sampleRate: 16000, channels: 1 } satisfies Segment);
    segmentHandlers.forEach((h) => h(payload));
  };

  return { recorder, emitFrame, emitSegment };
}

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
    const provider = createProviderStub({ deferredConnect: true });
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });

    // Start connecting but do not resolve yet
    const pending = controller.connect();

    // Emit a frame while stream is not yet connected
    const buffered = makeFrame();
    emitFrame(buffered);

    // Now resolve connect and await
    provider.streamInstance.connectDeferred?.resolve();
    await pending;

    // The first frame must be flushed to the stream
    expect(provider.streamInstance.lastSentFrame).toBe(buffered);
  });

  test('preconnectBufferMs clamps with warning when above soft max', async () => {
    const provider = createProviderStub({ deferredConnect: true });
    const { recorder } = createRecorderStub();

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
    createTranscription({ provider, recorder, logger, preconnectBufferMs: 500 });

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
    const provider = createProviderStub({ deferredConnect: true });
    const { recorder } = createRecorderStub();
    const warnings: Array<{ message: string }> = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: string) => warnings.push({ message }),
      error: () => {},
      child: () => logger,
    };
    createTranscription({ provider, recorder, logger, preconnectBufferMs: -10 });
    expect(warnings.length).toBe(1);
  });

  test('preconnectBufferMs respected: trims to last frame when budget too small', async () => {
    const provider = createProviderStub({ deferredConnect: true });
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, preconnectBufferMs: 1 });

    const f1 = makeFrameWithSamples(320); // ~20ms
    const f2 = makeFrameWithSamples(320); // ~20ms
    const f3 = makeFrameWithSamples(320); // ~20ms

    const pending = controller.connect();
    emitFrame(f1);
    emitFrame(f2);
    emitFrame(f3);
    provider.streamInstance.connectDeferred?.resolve();
    await pending;

    expect(provider.streamInstance.sentFrames.length).toBe(1);
    expect(provider.streamInstance.sentFrames[0]).toBe(f3);
  });

  test('preconnectBufferMs equal to threshold keeps all frames', async () => {
    const provider = createProviderStub({ deferredConnect: true });
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, preconnectBufferMs: 60 });
    const f1 = makeFrameWithSamples(320); // ~20ms
    const f2 = makeFrameWithSamples(320); // ~20ms
    const f3 = makeFrameWithSamples(320); // ~20ms
    const pending = controller.connect();
    emitFrame(f1);
    emitFrame(f2);
    emitFrame(f3);
    provider.streamInstance.connectDeferred?.resolve();
    await pending;
    expect(provider.streamInstance.sentFrames.length).toBe(3);
  });

  test('no frames forwarded after disconnect (unsubscribe works)', async () => {
    const provider = createProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });
    await controller.connect();
    const first = makeFrame();
    emitFrame(first);
    expect(provider.streamInstance.lastSentFrame).toBe(first);
    await controller.disconnect();
    const after = makeFrame();
    emitFrame(after);
    expect(provider.streamInstance.lastSentFrame).toBe(first);
  });

  test('connect called twice concurrently performs single stream.connect', async () => {
    const provider = createProviderStub({ deferredConnect: true });
    const { recorder } = createRecorderStub();
    // Wrap stream to count connect calls
    let connectCalls = 0;
    const base = provider.streamInstance;
    provider.stream = () =>
      ({
        ...base,
        async connect() {
          connectCalls += 1;
          await base.connect();
        },
      }) as unknown as TranscriptionStream;
    const controller = createTranscription({ provider, recorder });
    const p1 = controller.connect();
    const p2 = controller.connect();
    provider.streamInstance.connectDeferred?.resolve();
    await Promise.all([p1, p2]);
    expect(connectCalls).toBe(1);
  });

  test('maxAttempts enforced: stops after limit', async () => {
    const provider = createRetryingProviderStub([new NetworkError('a'), new NetworkError('b')]);
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, retry: { maxAttempts: 2, baseDelayMs: 5 } });
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
    const provider: ProviderStub = {
      ...createProviderStub(),
      stream: () => streamNoPartial,
      streamInstance: base,
    };
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });
    await controller.connect();
    expect(controller.isConnected).toBe(true);
  });
  test('connect/disconnect lifecycle updates status', async () => {
    const provider = createProviderStub();
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });

    expect(controller.status).toBe('idle');
    await controller.connect();
    expect(controller.isConnected).toBe(true);
    expect(controller.status).toBe('connected');

    await controller.disconnect();
    expect(controller.isConnected).toBe(false);
    expect(controller.status).toBe('disconnected');
  });

  test('forwards frames from recorder to stream.send', async () => {
    const provider = createProviderStub();
    const { recorder, emitFrame } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });

    await controller.connect();
    const frame = makeFrame();
    emitFrame(frame);

    expect(provider.streamInstance.lastSentFrame).toBe(frame);
  });

  test('propagates transcript and partial events to subscribers', async () => {
    const provider = createProviderStub();
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });

    const partials: string[] = [];
    const finals: TranscriptResult[] = [];
    controller.onPartial((t: string) => partials.push(t));
    controller.onTranscript((r: TranscriptResult) => finals.push(r));

    await controller.connect();
    provider.streamInstance.emitPartial('hel');
    provider.streamInstance.emitTranscript({ text: 'hello' });

    expect(partials).toEqual(['hel']);
    expect(finals).toEqual([{ text: 'hello' }]);
  });

  test('propagates errors and sets error status', async () => {
    const provider = createProviderStub();
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });

    const errors: Error[] = [];
    controller.onError((e: Error) => errors.push(e));

    await controller.connect();
    const boom = new Error('boom');
    provider.streamInstance.emitError(boom);

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
    const provider = createProviderStub();
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });

    await controller.connect();
    await controller.forceEndpoint();
    expect(provider.streamInstance.forceEndpointCalls).toBe(1);
  });

  test('flushOnSegmentEnd triggers forceEndpoint when supported', async () => {
    const provider = createProviderStub();
    const { recorder, emitSegment } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, flushOnSegmentEnd: true });

    await controller.connect();
    emitSegment();
    expect(provider.streamInstance.forceEndpointCalls).toBe(1);
  });

  test('flushOnSegmentEnd no-ops when provider lacks capability', async () => {
    const provider = createProviderStub();
    // mutate capability for this test case
    provider.capabilities.forceEndpoint = false;
    const { recorder, emitSegment } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, flushOnSegmentEnd: true });

    await controller.connect();
    emitSegment();
    expect(provider.streamInstance.forceEndpointCalls).toBe(0);
  });

  test('flushOnSegmentEnd uses cooldown (200ms)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));

    const provider = createProviderStub();
    const { recorder, emitSegment } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, flushOnSegmentEnd: true });
    await controller.connect();

    emitSegment(); // t=0ms
    emitSegment(); // t=0ms again → should be ignored by cooldown
    expect(provider.streamInstance.forceEndpointCalls).toBe(1);

    vi.setSystemTime(new Date(1201));
    emitSegment(); // t=201ms → passes cooldown
    expect(provider.streamInstance.forceEndpointCalls).toBe(2);

    vi.useRealTimers();
  });

  test('no force after disconnect', async () => {
    const provider = createProviderStub();
    const { recorder, emitSegment } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, flushOnSegmentEnd: true });

    await controller.connect();
    await controller.disconnect();
    emitSegment();
    expect(provider.streamInstance.forceEndpointCalls).toBe(0);
  });

  test('retries on NetworkError and eventually connects', async () => {
    const provider = createRetryingProviderStub([new NetworkError('net'), 'ok']);
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, retry: { baseDelayMs: 10, jitterRatio: 0 } });
    await controller.connect();
    expect(controller.isConnected).toBe(true);
  });

  test('respects RateLimitError retryAfterMs', async () => {
    const provider = createRetryingProviderStub([new RateLimitError('rl', 50), 'ok']);
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, retry: { baseDelayMs: 5, jitterRatio: 0 } });
    await controller.connect();
    expect(controller.isConnected).toBe(true);
  });

  test('does not retry on AuthenticationError', async () => {
    const provider = createRetryingProviderStub([new AuthenticationError('bad'), 'ok']);
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, retry: { baseDelayMs: 5 } });
    void controller.connect();
    await new Promise((r) => setTimeout(r, 20));
    expect(controller.isConnected).toBe(false);
  });

  test('cancels retry on disconnect', async () => {
    vi.useFakeTimers();
    const provider = createRetryingProviderStub([new NetworkError('net'), 'ok']);
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder, retry: { baseDelayMs: 200 } });
    void controller.connect();
    // scheduled retry at 200ms
    await controller.disconnect();
    vi.advanceTimersByTime(500);
    expect(controller.isConnected).toBe(false);
    vi.useRealTimers();
  });

  test('status change events are forwarded', async () => {
    const provider = createProviderStub();
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });

    const statuses: StreamStatus[] = [];
    controller.onStatusChange((s) => statuses.push(s));

    await controller.connect();
    provider.streamInstance.emitStatus('ready');

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('ready');
  });
});
