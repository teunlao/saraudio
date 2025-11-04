import { type Frame, Pipeline, type Stage } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { describe, expect, it, vi } from 'vitest';
import { createRecorder } from '../recorder';
import type { BrowserRuntime } from '../types';

const createLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => createLogger(),
});

const createRuntime = (pipeline: Pipeline, overrides: Partial<BrowserRuntime>): BrowserRuntime => {
  const baseStage: Stage = {
    name: 'runtime-stage',
    setup: () => {},
    handle: () => {},
    teardown: () => {},
  };

  const runtime: BrowserRuntime = {
    services: {
      clock: () => 0,
      createId: () => 'id',
      logger: createLogger(),
    },
    createPipeline: () => pipeline,
    createSegmenter: () => ({
      id: 'segmenter',
      metadata: 'default',
      create: () => baseStage,
      configure: () => {},
    }),
    createMicrophoneSource: () => ({
      async start() {
        // noop
      },
      async stop() {
        // noop
      },
    }),
    run: async () => {},
  };

  return { ...runtime, ...overrides };
};

describe('Recorder source configuration', () => {
  it('passes microphone deviceId as exact constraint when starting', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    const createMicrophoneSource = vi.fn<BrowserRuntime['createMicrophoneSource']>(() => ({
      start: vi.fn(async (_onFrame: (frame: Frame) => void) => {}),
      stop: vi.fn(async () => {}),
    }));

    const runtime = createRuntime(pipeline, {
      createMicrophoneSource,
    });

    const recorder = createRecorder({
      runtime,
      source: { microphone: { deviceId: '  mic-123  ' } },
    });

    await recorder.start();

    expect(createMicrophoneSource).toHaveBeenCalledTimes(1);
    expect(createMicrophoneSource.mock.calls[0][0]).toMatchObject({
      constraints: { deviceId: { exact: 'mic-123' } },
    });

    await recorder.stop();
    recorder.dispose();
  });

  it('reuses legacy constraints when no source microphone is provided', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    const createMicrophoneSource = vi.fn<BrowserRuntime['createMicrophoneSource']>(() => ({
      start: vi.fn(async (_onFrame: (frame: Frame) => void) => {}),
      stop: vi.fn(async () => {}),
    }));

    const legacyConstraints: MediaTrackConstraints = { sampleRate: 44100 };

    const runtime = createRuntime(pipeline, {
      createMicrophoneSource,
    });

    const recorder = createRecorder({
      runtime,
      constraints: legacyConstraints,
    });

    await recorder.start();

    expect(createMicrophoneSource).toHaveBeenCalledTimes(1);
    expect(createMicrophoneSource.mock.calls[0][0]).toMatchObject({
      constraints: legacyConstraints,
    });

    await recorder.stop();
    recorder.dispose();
  });

  it('updates deviceId constraint after update()', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    const createMicrophoneSource = vi.fn<BrowserRuntime['createMicrophoneSource']>(() => ({
      start: vi.fn(async (_onFrame: (frame: Frame) => void) => {}),
      stop: vi.fn(async () => {}),
    }));

    const runtime = createRuntime(pipeline, {
      createMicrophoneSource,
    });

    const recorder = createRecorder({
      runtime,
      source: { microphone: { deviceId: 'initial' } },
    });

    await recorder.start();
    await recorder.stop();

    await recorder.update({ source: { microphone: { deviceId: 'updated' } } });

    await recorder.start();

    expect(createMicrophoneSource).toHaveBeenCalledTimes(2);
    expect(createMicrophoneSource.mock.calls[1][0]).toMatchObject({
      constraints: { deviceId: { exact: 'updated' } },
    });

    await recorder.stop();
    recorder.dispose();
  });
});

describe('Recorder format normalization', () => {
  const makePipeline = (): Pipeline =>
    new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

  it('normalizes frames to requested sample rate and encoding', async () => {
    const pipeline = makePipeline();
    const input = new Int16Array(480);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = (i % 2 === 0 ? 1 : -1) * 12000;
    }

    const startSpy = vi.fn(async (onFrame: (frame: Frame) => void) => {
      onFrame({
        pcm: input,
        tsMs: 100,
        sampleRate: 48000,
        channels: 1,
      });
    });

    const runtime = createRuntime(pipeline, {
      createMicrophoneSource: () => ({
        start: startSpy,
        stop: vi.fn(async () => {}),
      }),
    });

    const recorder = createRecorder({
      runtime,
      format: { sampleRate: 16000, encoding: 'pcm16' },
    });

    const received: Frame[] = [];
    recorder.subscribeFrames((frame) => {
      received.push(frame);
    });

    await recorder.start();
    await recorder.stop();

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
    const normalized = received[0];
    expect(normalized.sampleRate).toBe(16000);
    expect(normalized.channels).toBe(1);
    expect(normalized.pcm).toBeInstanceOf(Int16Array);
    expect((normalized.pcm as Int16Array).length).toBe(160);

    recorder.dispose();
  });

  it('buffers normalized frames for late subscribers and emits onReady once', async () => {
    const pipeline = makePipeline();
    const input = new Int16Array(480);
    input.fill(8000);

    const startMock = vi.fn(async (onFrame: (frame: Frame) => void) => {
      queueMicrotask(() => {
        onFrame({
          pcm: input,
          tsMs: 0,
          sampleRate: 48000,
          channels: 1,
        });
      });
    });

    const runtime = createRuntime(pipeline, {
      createMicrophoneSource: () => ({
        start: startMock,
        stop: vi.fn(async () => {}),
      }),
    });

    const recorder = createRecorder({
      runtime,
      format: { sampleRate: 16000, encoding: 'pcm16' },
    });

    const ready = vi.fn();
    recorder.onReady(ready);

    await recorder.start();
    expect(startMock).toHaveBeenCalledTimes(1);
    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        resolve();
      });
    });

    expect(ready).toHaveBeenCalledTimes(1);

    const received: Frame[] = [];
    recorder.subscribeFrames((frame) => {
      received.push(frame);
    });

    expect(received).toHaveLength(1);
    expect(received[0].sampleRate).toBe(16000);
    expect(received[0].pcm).toBeInstanceOf(Int16Array);

    await recorder.stop();
    recorder.dispose();
  });
});
