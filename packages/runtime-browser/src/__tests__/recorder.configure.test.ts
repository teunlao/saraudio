import { Pipeline, type Stage, type StageController } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { describe, expect, it } from 'vitest';
import { createRecorder } from '../recorder';
import type { BrowserRuntime } from '../types';

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
      metadata: 'default',
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

    const controller = (metadata: string): StageController => ({
      id: 'custom-stage',
      metadata,
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
        metadata: 'default',
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
