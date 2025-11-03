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
