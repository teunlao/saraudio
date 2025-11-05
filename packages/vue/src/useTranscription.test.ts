import type { TranscriptionProvider, TranscriptResult } from '@saraudio/core';
import { createRecorderStub, createTranscriptionProviderStub } from '@saraudio/core/testing';
import { createTranscriptionControllerStub } from '@saraudio/runtime-base/testing';
import type { CreateTranscriptionOptions, Recorder, TranscriptionController } from '@saraudio/runtime-browser';
import * as runtimeBrowser from '@saraudio/runtime-browser';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { nextTick } from 'vue';

import { withSetup } from './test-utils/withSetup';
import { useTranscription } from './useTranscription';

let createTranscriptionMock: MockInstance<(options: CreateTranscriptionOptions) => TranscriptionController> | null =
  null;

const createRecorder = (): Recorder => {
  const stub = createRecorderStub();
  // Wrap update() to spy on it
  const originalUpdate = stub.update;
  stub.update = vi.fn(originalUpdate);
  // Extend recordings with browser-specific getBlob()
  const recordings = stub.recordings;
  const browserRecordings = {
    cleaned: { ...recordings.cleaned, getBlob: async () => null },
    full: { ...recordings.full, getBlob: async () => null },
    masked: { ...recordings.masked, getBlob: async () => null },
    meta: recordings.meta,
    clear: recordings.clear,
  };
  stub.recordings = browserRecordings as Recorder['recordings'];
  return stub as unknown as Recorder;
};

const flushPromises = (): Promise<void> =>
  new Promise((resolve) => {
    const globalWithSetImmediate = globalThis as typeof globalThis & {
      setImmediate?: (callback: () => void) => void;
    };
    if (typeof globalWithSetImmediate.setImmediate === 'function') {
      globalWithSetImmediate.setImmediate(resolve);
      return;
    }
    setTimeout(resolve, 0);
  });

describe('useTranscription', () => {
  let apps: ReturnType<typeof withSetup>[1][];
  let controllerStub: ReturnType<typeof createTranscriptionControllerStub> | null;

  beforeEach(() => {
    apps = [];
    controllerStub = null;
    const spy = vi.spyOn(runtimeBrowser, 'createTranscription');
    spy.mockImplementation(() => {
      controllerStub = createTranscriptionControllerStub();
      // Wrap methods to spy on them
      controllerStub.connect = vi.fn(controllerStub.connect);
      controllerStub.disconnect = vi.fn(controllerStub.disconnect);
      controllerStub.clear = vi.fn(controllerStub.clear);
      controllerStub.forceEndpoint = vi.fn(controllerStub.forceEndpoint);
      return controllerStub;
    });
    createTranscriptionMock = spy;
  });

  afterEach(() => {
    for (const app of apps) {
      app.unmount();
    }
    apps = [];
    createTranscriptionMock?.mockRestore();
    createTranscriptionMock = null;
  });

  it('connects and aggregates transcripts', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const recorder = createRecorder();

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();

    expect(createTranscriptionMock).not.toBeNull();
    expect(createTranscriptionMock?.mock.calls.length).toBeGreaterThan(0);
    expect(recorder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        format: expect.objectContaining({ sampleRate: 16000, channels: 1, encoding: 'pcm16' }),
      }),
    );

    controllerStub?.emitPartial('hel');
    expect(result.partial.value).toBe('hel');

    controllerStub?.emitTranscript({ text: 'hello', language: 'en-US' });
    expect(result.transcript.value).toBe('hello');

    controllerStub?.emitTranscript({ text: 'world', language: 'en-US' });
    expect(result.transcript.value).toBe('hello world');

    await result.disconnect();
  });

  it('clears transcript and partial', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const recorder = createRecorder();

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();

    controllerStub?.emitTranscript({ text: 'sample', language: 'en-US' });
    controllerStub?.emitPartial('temp');

    result.clear();
    expect(result.transcript.value).toBe('');
    expect(result.partial.value).toBe('');
  });

  it('invokes callbacks on transcript and error', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const recorder = createRecorder();
    const transcriptCb = vi.fn();
    const errorCb = vi.fn();

    const [result, app] = withSetup(() =>
      useTranscription({ provider, recorder, onTranscript: transcriptCb, onError: errorCb }),
    );
    apps.push(app);

    await result.connect();

    const finalResult: TranscriptResult = { text: 'done', language: 'en-US' };
    controllerStub?.emitTranscript(finalResult);
    expect(transcriptCb).toHaveBeenCalledWith(finalResult);

    const err = new Error('boom');
    controllerStub?.emitError(err);
    expect(errorCb).toHaveBeenCalledWith(err);
    expect(result.error.value).toBe(err);
  });

  it('auto-connects when enabled', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const recorder = createRecorder();

    const [_, app] = withSetup(() => useTranscription({ provider, recorder, autoConnect: true }));
    apps.push(app);

    await nextTick();
    await flushPromises();
    await flushPromises();

    expect(createTranscriptionMock).not.toBeNull();
    expect(createTranscriptionMock?.mock.calls.length).toBeGreaterThan(0);
    expect(controllerStub).not.toBeNull();
    expect(controllerStub?.connect).toHaveBeenCalled();
  });

  it('keeps partial empty for HTTP providers', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'http' });
    const recorder = createRecorder();

    createTranscriptionMock?.mockImplementationOnce(() => {
      controllerStub = createTranscriptionControllerStub({ transport: 'http' });
      controllerStub.connect = vi.fn(controllerStub.connect);
      controllerStub.disconnect = vi.fn(controllerStub.disconnect);
      controllerStub.clear = vi.fn(controllerStub.clear);
      controllerStub.forceEndpoint = vi.fn(controllerStub.forceEndpoint);
      return controllerStub;
    });

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();

    controllerStub?.emitPartial('ignored');
    expect(result.partial.value).toBe('');
  });

  it('disconnects controller on unmount', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const recorder = createRecorder();

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();
    app.unmount();

    expect(controllerStub?.disconnect).toHaveBeenCalled();
  });

  it('reflects provider transport changes via update events', async () => {
    const recorder = createRecorder();
    type UpdateOptions = { transport: 'websocket' | 'http' };
    const listeners = new Set<(options: UpdateOptions) => void>();
    let currentTransport: 'websocket' | 'http' = 'websocket';

    const provider = {
      id: 'dynamic-provider',
      get transport() {
        return currentTransport;
      },
      capabilities: {
        partials: 'mutable' as const,
        words: true,
        diarization: 'word' as const,
        language: 'final' as const,
        segments: true,
        forceEndpoint: true,
        multichannel: false,
      },
      getPreferredFormat: () => ({ sampleRate: 16000, channels: 1 as const, encoding: 'pcm16' as const }),
      getSupportedFormats: () => [{ sampleRate: 16000, channels: 1 as const, encoding: 'pcm16' as const }],
      update: async (options: UpdateOptions) => {
        currentTransport = options.transport;
        listeners.forEach((listener) => listener(options));
      },
      onUpdate: (listener: (options: UpdateOptions) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      stream: () => ({
        get status() {
          return 'idle' as const;
        },
        async connect() {},
        async disconnect() {},
        send() {},
        async forceEndpoint() {},
        onTranscript() {
          return () => {};
        },
        onPartial() {
          return () => {};
        },
        onError() {
          return () => {};
        },
        onStatusChange() {
          return () => {};
        },
      }),
    } satisfies TranscriptionProvider<UpdateOptions>;

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    expect(result.transport).toBe('websocket');
    await provider.update({ transport: 'http' });
    expect(result.transport).toBe('http');

    app.unmount();
  });
});
