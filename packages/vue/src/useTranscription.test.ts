import type { TranscriptUpdate } from '@saraudio/core';
import { createRecorderStub, createTranscriptionProviderStub } from '@saraudio/core/testing';
import { createTranscriptionControllerStub } from '@saraudio/runtime-base/testing';
import type { CreateTranscriptionOptions, Recorder, TranscriptionController } from '@saraudio/runtime-browser';
import * as runtimeBrowser from '@saraudio/runtime-browser';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { nextTick, ref } from 'vue';

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

    controllerStub?.emitUpdate({
      providerId: provider.id,
      tokens: [{ text: 'hel', isFinal: false }],
    });
    expect(result.partial.value).toBe('hel');

    controllerStub?.emitUpdate({
      providerId: provider.id,
      tokens: [{ text: 'hello ', isFinal: true }],
      language: 'en-US',
    });
    expect(result.transcript.value).toBe('hello');

    controllerStub?.emitUpdate({
      providerId: provider.id,
      tokens: [{ text: 'world', isFinal: true }],
      language: 'en-US',
    });
    expect(result.transcript.value).toBe('hello world');

    await result.disconnect();
  });

  it('clears transcript and partial', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const recorder = createRecorder();

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();

    controllerStub?.emitUpdate({
      providerId: provider.id,
      tokens: [{ text: 'sample', isFinal: true }],
      language: 'en-US',
    });
    controllerStub?.emitUpdate({
      providerId: provider.id,
      tokens: [{ text: 'temp', isFinal: false }],
    });

    result.clear();
    expect(result.transcript.value).toBe('');
    expect(result.partial.value).toBe('');
  });

  it('invokes callbacks on transcript and error', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const recorder = createRecorder();
    const updateCb = vi.fn();
    const errorCb = vi.fn();

    const [result, app] = withSetup(() =>
      useTranscription({ provider, recorder, onUpdate: updateCb, onError: errorCb }),
    );
    apps.push(app);

    await result.connect();

    const finalUpdate: TranscriptUpdate = {
      providerId: provider.id,
      tokens: [{ text: 'done', isFinal: true }],
      language: 'en-US',
    };
    controllerStub?.emitUpdate(finalUpdate);
    expect(updateCb).toHaveBeenCalledWith(finalUpdate);

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

    controllerStub?.emitUpdate({
      providerId: provider.id,
      tokens: [{ text: 'ignored', isFinal: false }],
    });
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

  it('reflects transport ref changes (controller-level selection)', async () => {
    const recorder = createRecorder();
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const t = ref<'websocket' | 'http'>('websocket');

    // Create two controller stubs with respective transports
    const created: Array<ReturnType<typeof createTranscriptionControllerStub>> = [];
    createTranscriptionMock?.mockImplementationOnce(() => {
      const s = createTranscriptionControllerStub({ transport: 'websocket' });
      s.connect = vi.fn(s.connect);
      s.disconnect = vi.fn(s.disconnect);
      created.push(s);
      controllerStub = s;
      return s;
    });
    createTranscriptionMock?.mockImplementationOnce(() => {
      const s = createTranscriptionControllerStub({ transport: 'http' });
      s.connect = vi.fn(s.connect);
      s.disconnect = vi.fn(s.disconnect);
      created.push(s);
      controllerStub = s;
      return s;
    });

    const [result, app] = withSetup(() => useTranscription({ provider, recorder, transport: t }));
    apps.push(app);

    await result.connect();
    expect(result.transport).toBe('websocket');

    t.value = 'http';
    await nextTick();
    await flushPromises();
    expect(created.length).toBe(2);
    expect(created[0].disconnect).toHaveBeenCalled();
    expect(created[1].connect).toHaveBeenCalled();
    expect(result.transport).toBe('http');

    app.unmount();
  });

  it('does not invoke provider.update again if options unchanged', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const recorder = createRecorder();

    const updateSpy = vi.spyOn(provider, 'update');
    const listeners = new Set<() => void>();
    provider.onUpdate = (listener) => {
      listeners.add(listener as () => void);
      return () => listeners.delete(listener as () => void);
    };

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    await result.connect();
    expect(updateSpy).toHaveBeenCalledTimes(0);

    await provider.update({});
    expect(updateSpy).toHaveBeenCalledTimes(1);

    await provider.update({});
    expect(updateSpy).toHaveBeenCalledTimes(2);

    app.unmount();
  });

  it('unsubscribes from provider updates on unmount', async () => {
    const provider = createTranscriptionProviderStub({ transport: 'websocket' });
    const unsubscribe = vi.fn();
    const originalOnUpdate = provider.onUpdate.bind(provider);
    provider.onUpdate = (listener) => {
      const off = originalOnUpdate(listener);
      return () => {
        unsubscribe();
        off();
      };
    };

    const recorder = createRecorder();
    const [_, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    app.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('recreates controller and reconnects when provider computed changes while connected', async () => {
    const recorder = createRecorder();
    const t = ref<'ws' | 'http'>('ws');

    const providerWS = createTranscriptionProviderStub({ transport: 'websocket' });
    const providerHTTP = createTranscriptionProviderStub({ transport: 'http' });

    const reactiveProvider = () => (t.value === 'ws' ? providerWS : providerHTTP);

    // Capture two controller stubs to assert disconnect/connect across swap
    const created: Array<ReturnType<typeof createTranscriptionControllerStub>> = [];
    createTranscriptionMock?.mockImplementationOnce(() => {
      const s = createTranscriptionControllerStub();
      s.connect = vi.fn(s.connect);
      s.disconnect = vi.fn(s.disconnect);
      created.push(s);
      controllerStub = s;
      return s;
    });
    createTranscriptionMock?.mockImplementationOnce(() => {
      const s = createTranscriptionControllerStub();
      s.connect = vi.fn(s.connect);
      s.disconnect = vi.fn(s.disconnect);
      created.push(s);
      controllerStub = s;
      return s;
    });

    const [result, app] = withSetup(() => useTranscription({ provider: reactiveProvider, recorder }));
    apps.push(app);

    await result.connect();
    expect(created.length).toBe(1);

    // flip provider to HTTP
    t.value = 'http';
    await nextTick();
    await flushPromises();

    // should disconnect old controller and create a new one, then reconnect
    expect(created[0].disconnect).toHaveBeenCalled();
    expect(created.length).toBe(2);
    expect(created[1].connect).toHaveBeenCalled();

    app.unmount();
  });

  it('does not auto-connect on provider change if not connected; creates new controller on next connect', async () => {
    const recorder = createRecorder();
    const mode = ref<'A' | 'B'>('A');
    const providerA = createTranscriptionProviderStub({ transport: 'websocket' });
    const providerB = createTranscriptionProviderStub({ transport: 'websocket' });
    const provider = () => (mode.value === 'A' ? providerA : providerB);

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);

    // change provider before first connect
    mode.value = 'B';
    await nextTick();
    await flushPromises();
    expect(createTranscriptionMock?.mock.calls.length ?? 0).toBe(0);

    await result.connect();
    expect(createTranscriptionMock?.mock.calls.length ?? 0).toBe(1);

    app.unmount();
  });

  it('coalesces multiple provider changes in one tick; if last equals current, skips rebuild', async () => {
    const recorder = createRecorder();
    const t = ref<'ws' | 'http'>('ws');

    const providerWS = createTranscriptionProviderStub({ transport: 'websocket' });
    const providerHTTP = createTranscriptionProviderStub({ transport: 'http' });
    const reactiveProvider = () => (t.value === 'ws' ? providerWS : providerHTTP);

    const created: Array<ReturnType<typeof createTranscriptionControllerStub>> = [];
    createTranscriptionMock?.mockImplementation(() => {
      const s = createTranscriptionControllerStub({ transport: t.value === 'ws' ? 'websocket' : 'http' });
      s.connect = vi.fn(s.connect);
      s.disconnect = vi.fn(s.disconnect);
      created.push(s);
      controllerStub = s;
      return s;
    });

    const [result, app] = withSetup(() => useTranscription({ provider: reactiveProvider, recorder }));
    apps.push(app);

    await result.connect();
    expect(created.length).toBe(1);

    // Rapidly flip provider twice within same tick
    t.value = 'http';
    t.value = 'ws';
    await nextTick();
    await flushPromises();

    // Net effect: back to initial 'ws' — no rebuild should happen
    expect(created.length).toBe(1);
    expect(created[0].disconnect).not.toHaveBeenCalled();

    app.unmount();
  });

  it('cancels scheduled provider swap on unmount (no extra controller created)', async () => {
    const recorder = createRecorder();
    const t = ref<'ws' | 'http'>('ws');
    const providerWS = createTranscriptionProviderStub({ transport: 'websocket' });
    const providerHTTP = createTranscriptionProviderStub({ transport: 'http' });
    const provider = () => (t.value === 'ws' ? providerWS : providerHTTP);

    const created: Array<ReturnType<typeof createTranscriptionControllerStub>> = [];
    createTranscriptionMock?.mockImplementation(() => {
      const s = createTranscriptionControllerStub({ transport: t.value === 'ws' ? 'websocket' : 'http' });
      created.push(s);
      controllerStub = s;
      return s;
    });

    const [result, app] = withSetup(() => useTranscription({ provider, recorder }));
    apps.push(app);
    await result.connect();
    expect(created.length).toBe(1);

    // Schedule a swap and immediately unmount before microtask runs
    t.value = 'http';
    app.unmount();
    await nextTick();
    await flushPromises();

    // No new controller must be created post-unmount
    expect(created.length).toBe(1);
  });
});
