import { Pipeline, type Segment, type Stage, type StageController } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { describe, expect, it, vi } from 'vitest';
import { createRecorder } from '../recorder';
import type { BrowserRuntime, MicrophoneSourceOptions } from '../types';

const createLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => createLogger(),
});

const createRuntime = (pipeline: Pipeline, overrides?: Partial<BrowserRuntime>): BrowserRuntime => {
  const baseStage = (): Stage => ({
    name: 'runtime-stage',
    setup: () => {},
    handle: () => {},
    teardown: () => {},
  });

  const runtime: BrowserRuntime = {
    services: {
      clock: () => 0,
      createId: () => 'id',
      logger: createLogger(),
    },
    createPipeline: () => pipeline,
    createSegmenter: () => ({
      id: 'segmenter',
      key: 'default',
      create: () => baseStage(),
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

describe('Recorder.configure', () => {
  it('reuses controller-backed stages and tears down replacements', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    let created = 0;
    let configured = 0;
    let tornDown = 0;

    const createStage = (): Stage => ({
      name: 'stage-under-test',
      setup: () => {},
      handle: () => {},
      teardown: () => {
        tornDown += 1;
      },
    });

    const controller = (key: string): StageController => ({
      id: 'custom-stage',
      key,
      create: () => {
        created += 1;
        return createStage();
      },
      configure: () => {
        configured += 1;
      },
    });

    const runtime = createRuntime(pipeline, {
      createSegmenter: () => ({
        id: 'segmenter',
        key: 'default',
        create: () => createStage(),
        configure: () => {},
      }),
    });

    const recorder = createRecorder({
      runtime,
      stages: [controller('alpha')],
      segmenter: false,
    });

    await recorder.configure();
    expect(created).toBe(1);
    expect(configured).toBe(1);
    expect(tornDown).toBe(0);

    await recorder.configure({ stages: [controller('alpha')], segmenter: false });
    expect(created).toBe(1);
    expect(configured).toBe(2);
    expect(tornDown).toBe(0);

    await recorder.configure({ stages: [controller('beta')], segmenter: false });
    expect(created).toBe(2);
    expect(configured).toBe(3);
    expect(tornDown).toBe(1);

    recorder.dispose();
  });

  it('creates default segmenter when not provided and tears it down when disabled', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    let created = 0;
    let tornDown = 0;

    const segmenterStage: Stage = {
      name: 'segmenter',
      setup: () => {},
      handle: () => {},
      teardown: () => {
        tornDown += 1;
      },
    };

    const runtime = createRuntime(pipeline, {
      createSegmenter: () => ({
        id: 'segmenter',
        metadata: 'auto',
        create: () => {
          created += 1;
          return segmenterStage;
        },
        configure: () => {},
      }),
    });

    const recorder = createRecorder({ runtime });

    await recorder.configure();
    expect(created).toBe(1);
    expect(tornDown).toBe(0);

    await recorder.configure({ segmenter: false });
    expect(created).toBe(1);
    expect(tornDown).toBe(1);

    recorder.dispose();
  });
});

describe('Recorder.update', () => {
  it('reuses controller-backed stages when key is unchanged', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    let created = 0;
    let configured = 0;
    let tornDown = 0;

    const createStage = (): Stage => ({
      name: 'stage-under-test',
      setup: () => {},
      handle: () => {},
      teardown: () => {
        tornDown += 1;
      },
    });

    const controller = (key: string): StageController => ({
      id: 'custom-stage',
      key,
      create: () => {
        created += 1;
        return createStage();
      },
      configure: () => {
        configured += 1;
      },
    });

    const runtime = createRuntime(pipeline, {
      createSegmenter: () => ({
        id: 'segmenter',
        key: 'default',
        create: () => createStage(),
        configure: () => {},
      }),
    });

    const recorder = createRecorder({
      runtime,
      stages: [controller('alpha')],
      segmenter: false,
    });

    await recorder.update();
    expect(created).toBe(1);
    expect(configured).toBe(1);
    expect(tornDown).toBe(0);

    await recorder.update({ stages: [controller('alpha')], segmenter: false });
    expect(created).toBe(1);
    expect(configured).toBe(2);
    expect(tornDown).toBe(0);

    await recorder.update({ stages: [controller('beta')], segmenter: false });
    expect(created).toBe(2);
    expect(configured).toBe(3);
    expect(tornDown).toBe(1);

    recorder.dispose();
  });

  it('applies capture settings on the next start call', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    const capturedOptions: Array<MicrophoneSourceOptions | undefined> = [];
    const runtime = createRuntime(pipeline, {
      createMicrophoneSource: (opts) => {
        capturedOptions.push(opts);
        return {
          async start() {
            // simulate synchronous start without frames
          },
          async stop() {
            // noop
          },
        };
      },
    });

    const recorder = createRecorder({ runtime });

    await recorder.start();
    expect(capturedOptions).toHaveLength(1);
    expect(capturedOptions[0]?.allowFallback).toBeUndefined();
    expect(capturedOptions[0]?.mode).toBeUndefined();

    await recorder.stop();

    const onStream = vi.fn();
    await recorder.update({
      allowFallback: false,
      mode: 'audio-context',
      onStream,
    });

    await recorder.start();
    expect(capturedOptions).toHaveLength(2);
    expect(capturedOptions[1]?.allowFallback).toBe(false);
    expect(capturedOptions[1]?.mode).toBe('audio-context');
    expect(capturedOptions[1]?.onStream).toBe(onStream);

    await recorder.stop();
    expect(onStream).toHaveBeenCalledWith(null);

    recorder.dispose();
  });

  it('defers capture option changes until restart when already running', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    const capturedOptions: Array<MicrophoneSourceOptions | undefined> = [];
    const runtime = createRuntime(pipeline, {
      createMicrophoneSource: (opts) => {
        capturedOptions.push(opts);
        return {
          async start() {
            // keep recorder running without emitting frames
          },
          async stop() {
            // noop
          },
        };
      },
    });

    const recorder = createRecorder({ runtime });

    await recorder.start();
    expect(recorder.status).toBe('running');
    expect(capturedOptions).toHaveLength(1);

    await recorder.update({ allowFallback: false, mode: 'worklet' });
    expect(recorder.status).toBe('running');
    expect(capturedOptions).toHaveLength(1);

    await recorder.stop();

    await recorder.start();
    expect(capturedOptions).toHaveLength(2);
    expect(capturedOptions[1]?.mode).toBe('worklet');
    expect(capturedOptions[1]?.allowFallback).toBe(false);

    await recorder.stop();
    recorder.dispose();
  });

  it('toggles default segmenter with update calls', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    let created = 0;
    let configured = 0;
    let tornDown = 0;

    const runtime = createRuntime(pipeline, {
      createSegmenter: () => ({
        id: 'segmenter-under-test',
        metadata: 'default',
        create: () => {
          created += 1;
          return {
            name: 'segmenter-under-test',
            setup: () => {},
            handle: () => {},
            teardown: () => {
              tornDown += 1;
            },
          } satisfies Stage;
        },
        configure: () => {
          configured += 1;
        },
      }),
    });

    const recorder = createRecorder({ runtime });

    await recorder.update();
    expect(created).toBe(1);
    expect(configured).toBe(1);
    expect(tornDown).toBe(0);

    await recorder.update({ segmenter: false });
    expect(created).toBe(1);
    expect(configured).toBe(1);
    expect(tornDown).toBe(1);

    await recorder.update({ segmenter: undefined });
    expect(created).toBe(2);
    expect(configured).toBe(2);
    expect(tornDown).toBe(1);

    recorder.dispose();
  });

  it('resets recordings when produce options change', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    const runtime = createRuntime(pipeline);
    const recorder = createRecorder({ runtime });

    await recorder.update();

    const baseSegment: Segment = {
      id: 'seg-1',
      startMs: 0,
      endMs: 100,
      durationMs: 100,
      sampleRate: 16000,
      channels: 1,
      pcm: new Int16Array(1600),
    };

    recorder.pipeline.events.emit('segment', baseSegment);
    expect(await recorder.recordings.cleaned.getBlob()).not.toBeNull();

    await recorder.update({ produce: { cleaned: false } });
    expect(await recorder.recordings.cleaned.getBlob()).toBeNull();

    recorder.pipeline.events.emit('segment', { ...baseSegment, id: 'seg-2' });
    expect(await recorder.recordings.cleaned.getBlob()).toBeNull();

    await recorder.update({ produce: undefined });
    recorder.pipeline.events.emit('segment', { ...baseSegment, id: 'seg-3' });
    expect(await recorder.recordings.cleaned.getBlob()).not.toBeNull();

    recorder.dispose();
  });
});
