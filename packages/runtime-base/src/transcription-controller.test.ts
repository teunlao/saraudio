import type {
  NormalizedFrame,
  ProviderCapabilities,
  Recorder,
  RecorderFormatOptions,
  RecorderStatus,
  StreamStatus,
  TranscriptionProvider,
  TranscriptionStream,
  TranscriptResult,
} from '@saraudio/core';

import { Pipeline } from '@saraudio/core';
import { createDeferred, type Deferred } from '@saraudio/utils';
import { describe, expect, test } from 'vitest';

import { createTranscription } from './transcription-controller';

function preferredFormat(): RecorderFormatOptions {
  return { sampleRate: 16000, channels: 1, encoding: 'pcm16' };
}

type Handler<T> = (value: T) => void;

interface StreamStub extends TranscriptionStream {
  emitTranscript(r: TranscriptResult): void;
  emitPartial(text: string): void;
  emitError(e: Error): void;
  emitStatus(s: StreamStatus): void;
  lastSentFrame: NormalizedFrame<'pcm16'> | null;
  forceEndpointCalls: number;
  connectDeferred?: Deferred<void>;
}

function createStreamStub(initialStatus: StreamStatus = 'idle', withDeferredConnect = false): StreamStub {
  let status: StreamStatus = initialStatus;
  const onTranscriptHandlers = new Set<Handler<TranscriptResult>>();
  const onPartialHandlers = new Set<Handler<string>>();
  const onErrorHandlers = new Set<Handler<Error>>();
  const onStatusHandlers = new Set<Handler<StreamStatus>>();
  let lastSentFrame: NormalizedFrame<'pcm16'> | null = null;
  let forceEndpointCalls = 0;
  let connectDeferred: Deferred<void> | undefined;
  if (withDeferredConnect) {
    connectDeferred = createDeferred<void>();
  }

  const stub: StreamStub = {
    get status() {
      return status;
    },
    async connect() {
      if (connectDeferred) {
        await connectDeferred.promise;
      }
    },
    async disconnect() {
      // no-op
    },
    send(frame) {
      lastSentFrame = frame;
    },
    async forceEndpoint() {
      forceEndpointCalls += 1;
    },
    onTranscript(h) {
      onTranscriptHandlers.add(h);
      return () => onTranscriptHandlers.delete(h);
    },
    onPartial(h) {
      onPartialHandlers.add(h);
      return () => onPartialHandlers.delete(h);
    },
    onError(h) {
      onErrorHandlers.add(h);
      return () => onErrorHandlers.delete(h);
    },
    onStatusChange(h) {
      onStatusHandlers.add(h);
      return () => onStatusHandlers.delete(h);
    },
    emitTranscript(r: TranscriptResult) {
      onTranscriptHandlers.forEach((h) => h(r));
    },
    emitPartial(text: string) {
      onPartialHandlers.forEach((h) => h(text));
    },
    emitError(e: Error) {
      onErrorHandlers.forEach((h) => h(e));
    },
    emitStatus(s: StreamStatus) {
      status = s;
      onStatusHandlers.forEach((h) => h(s));
    },
    get lastSentFrame() {
      return lastSentFrame;
    },
    get forceEndpointCalls() {
      return forceEndpointCalls;
    },
    get connectDeferred() {
      return connectDeferred;
    },
  };
  return stub;
}

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
    stream: () => streamInstance,
    streamInstance,
  };
  return provider;
}

function createRecorderStub(): { recorder: Recorder; emitFrame: (f: NormalizedFrame<'pcm16'>) => void } {
  // Trackers
  const frameHandlers = new Set<Handler<NormalizedFrame<'pcm16'>>>();
  const readyHandlers = new Set<() => void>();

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
    onSegment: () => () => {},
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

  return { recorder, emitFrame };
}

function makeFrame(): NormalizedFrame<'pcm16'> {
  return {
    pcm: new Int16Array([0, 1, -1, 2, -2]),
    tsMs: 0,
    sampleRate: 16000,
    channels: 1,
  };
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
    controller.onPartial((t) => partials.push(t));
    controller.onTranscript((r) => finals.push(r));

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
    controller.onError((e) => errors.push(e));

    await controller.connect();
    const boom = new Error('boom');
    provider.streamInstance.emitError(boom);

    expect(controller.status).toBe('error');
    expect(controller.error).toBe(boom);
    expect(errors).toEqual([boom]);
  });

  test('forceEndpoint is passed through to stream', async () => {
    const provider = createProviderStub();
    const { recorder } = createRecorderStub();
    const controller = createTranscription({ provider, recorder });

    await controller.connect();
    await controller.forceEndpoint();
    expect(provider.streamInstance.forceEndpointCalls).toBe(1);
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
