import type { ProviderCapabilities, StreamStatus, TranscriptionProvider, TranscriptResult } from '@saraudio/core';
import { createRecorderStub } from '@saraudio/core/testing';
import type { CreateTranscriptionOptions, Recorder, TranscriptionController } from '@saraudio/runtime-browser';
import * as runtimeBrowser from '@saraudio/runtime-browser';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { nextTick } from 'vue';

import { withSetup } from './test-utils/withSetup';
import { useTranscription } from './useTranscription';

const controllerMockFactory = () => {
  const transcriptHandlers = new Set<(result: TranscriptResult) => void>();
  const partialHandlers = new Set<(text: string) => void>();
  const errorHandlers = new Set<(error: Error) => void>();
  const statusHandlers = new Set<(status: StreamStatus) => void>();

  let status: StreamStatus = 'idle';
  let isConnected = false;
  let lastError: Error | null = null;

  const connect = vi.fn(async () => {
    status = 'connected';
    isConnected = true;
    statusHandlers.forEach((handler) => handler(status));
  });

  const disconnect = vi.fn(async () => {
    status = 'disconnected';
    isConnected = false;
    statusHandlers.forEach((handler) => handler(status));
  });

  const clear = vi.fn(() => {});
  const forceEndpoint = vi.fn(async () => {});

  const controller: TranscriptionController = {
    get status() {
      return status;
    },
    get transport() {
      return 'websocket' as const;
    },
    get error() {
      return lastError;
    },
    get isConnected() {
      return isConnected;
    },
    connect,
    disconnect,
    clear,
    forceEndpoint,
    onPartial(handler) {
      partialHandlers.add(handler);
      return () => partialHandlers.delete(handler);
    },
    onTranscript(handler) {
      transcriptHandlers.add(handler);
      return () => transcriptHandlers.delete(handler);
    },
    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
    onStatusChange(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
  };

  const emitTranscript = (result: TranscriptResult) => {
    transcriptHandlers.forEach((handler) => handler(result));
  };

  const emitPartial = (text: string) => {
    partialHandlers.forEach((handler) => handler(text));
  };

  const emitError = (err: Error) => {
    lastError = err;
    errorHandlers.forEach((handler) => handler(err));
  };

  const emitStatus = (next: StreamStatus) => {
    status = next;
    if (next === 'connected') {
      isConnected = true;
    } else if (next === 'disconnected') {
      isConnected = false;
    }
    statusHandlers.forEach((handler) => handler(next));
  };

  return {
    controller,
    connect,
    disconnect,
    clear,
    forceEndpoint,
    emitTranscript,
    emitPartial,
    emitError,
    emitStatus,
  };
};

let createTranscriptionMock: MockInstance<(options: CreateTranscriptionOptions) => TranscriptionController> | null =
  null;
type TransportKind = 'websocket' | 'http';

const capabilities: ProviderCapabilities = {
  partials: 'mutable',
  words: true,
  diarization: 'word',
  language: 'final',
  segments: true,
  forceEndpoint: false,
  multichannel: true,
};

const createProvider = (transport: TransportKind = 'websocket'): TranscriptionProvider => ({
  id: 'deepgram',
  transport,
  capabilities,
  getPreferredFormat: () => ({ sampleRate: 16000, channels: 1, encoding: 'pcm16' }),
  getSupportedFormats: () => [{ sampleRate: 16000, channels: 1, encoding: 'pcm16' }],
  stream: vi.fn(),
});

const createRecorder = (): Recorder => {
  const stub = createRecorderStub();
  const recorder = stub as unknown as Recorder;
  recorder.update = vi.fn(async () => {});
  recorder.recordings = {
    cleaned: {
      durationMs: 0,
      getBlob: async () => null,
    },
    full: {
      durationMs: 0,
      getBlob: async () => null,
    },
    masked: {
      durationMs: 0,
      getBlob: async () => null,
    },
    meta: () => ({ sessionDurationMs: 0, cleanedDurationMs: 0 }),
    clear: () => {},
  } as Recorder['recordings'];
  return recorder;
};

const flushPromises = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof globalThis.setImmediate === 'function') {
      globalThis.setImmediate(resolve);
      return;
    }
    setTimeout(resolve, 0);
  });

describe('useTranscription', () => {
  let apps: ReturnType<typeof withSetup>[1][];
  let controllerHarness: ReturnType<typeof controllerMockFactory> | null;

  beforeEach(() => {
    apps = [];
    controllerHarness = null;
    const spy = vi.spyOn(runtimeBrowser, 'createTranscription');
    spy.mockImplementation(() => {
      controllerHarness = controllerMockFactory();
      return controllerHarness.controller;
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
    const provider = createProvider('websocket');
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

    controllerHarness?.emitPartial('hel');
    expect(result.partial.value).toBe('hel');

    controllerHarness?.emitTranscript({ text: 'hello', language: 'en-US' });
    expect(result.transcript.value).toBe('hello');

    controllerHarness?.emitTranscript({ text: 'world', language: 'en-US' });
    expect(result.transcript.value).toBe('hello world');

    await result.disconnect();
  });

  it('clears transcript and partial', async () => {
    const provider = createProvider('websocket');
    const recorder = createRecorder();

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();

    controllerHarness?.emitTranscript({ text: 'sample', language: 'en-US' });
    controllerHarness?.emitPartial('temp');

    result.clear();
    expect(result.transcript.value).toBe('');
    expect(result.partial.value).toBe('');
  });

  it('invokes callbacks on transcript and error', async () => {
    const provider = createProvider('websocket');
    const recorder = createRecorder();
    const transcriptCb = vi.fn();
    const errorCb = vi.fn();

    const [result, app] = withSetup(() =>
      useTranscription({ provider, recorder, onTranscript: transcriptCb, onError: errorCb }),
    );
    apps.push(app);

    await result.connect();

    const finalResult: TranscriptResult = { text: 'done', language: 'en-US' };
    controllerHarness?.emitTranscript(finalResult);
    expect(transcriptCb).toHaveBeenCalledWith(finalResult);

    const err = new Error('boom');
    controllerHarness?.emitError(err);
    expect(errorCb).toHaveBeenCalledWith(err);
    expect(result.error.value).toBe(err);
  });

  it('auto-connects when enabled', async () => {
    const provider = createProvider('websocket');
    const recorder = createRecorder();

    const [_, app] = withSetup(() => useTranscription({ provider, recorder, autoConnect: true }));
    apps.push(app);

    await nextTick();
    await flushPromises();
    await flushPromises();

    expect(createTranscriptionMock).not.toBeNull();
    expect(createTranscriptionMock?.mock.calls.length).toBeGreaterThan(0);
    expect(controllerHarness).not.toBeNull();
    expect(controllerHarness?.connect).toHaveBeenCalled();
  });

  it('keeps partial empty for HTTP providers', async () => {
    const provider = createProvider('http');
    const recorder = createRecorder();

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();

    controllerHarness?.emitPartial('ignored');
    expect(result.partial.value).toBe('');
  });

  it('disconnects controller on unmount', async () => {
    const provider = createProvider('websocket');
    const recorder = createRecorder();

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();
    app.unmount();

    expect(controllerHarness?.disconnect).toHaveBeenCalled();
  });
});
