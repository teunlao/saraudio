import { describe, expect, it } from 'vitest';
import { Pipeline, type Stage, type StageContext, type StageController } from './pipeline';
import type { Frame } from './types';

interface TestEvent {
  type: string;
  payload?: unknown;
  tsMs?: number;
  speech?: boolean;
}

const createMockVadStage = (events: TestEvent[]): Stage => {
  let context: StageContext | null = null;
  return {
    name: 'mock-vad',
    setup(ctx) {
      context = ctx;
    },
    handle(frame) {
      if (!context) return;
      const speech = frame.pcm[0] >= 0.4;
      context.emit('vad', { tsMs: frame.tsMs, score: speech ? 1 : 0, speech });
      events.push({ type: 'vad-handle', tsMs: frame.tsMs, speech });
    },
  };
};

const createMockSegmenterStage = (events: TestEvent[]): Stage => ({
  name: 'mock-segmenter',
  setup(ctx) {
    ctx.on('vad', (score) => {
      events.push({ type: 'vad-event', payload: score });
    });
  },
  handle(frame) {
    events.push({ type: 'segmenter-handle', tsMs: frame.tsMs });
  },
});

const buildPipeline = () => {
  const events: TestEvent[] = [];
  let currentTime = 0;
  const pipeline = new Pipeline({
    now: () => currentTime,
    createId: () => 'segment-1',
  });
  pipeline.use(createMockVadStage(events));
  pipeline.use(createMockSegmenterStage(events));

  const push = (value: number, tsMs: number) => {
    currentTime = tsMs;
    const frame: Frame = {
      pcm: new Float32Array([value]),
      tsMs,
      sampleRate: 16000,
      channels: 1,
    };
    pipeline.push(frame);
  };

  return { events, pipeline, push };
};

describe('Pipeline', () => {
  it('routes frames through stages and emits events', () => {
    const { events, pipeline, push } = buildPipeline();
    push(0.1, 0);
    push(0.5, 10);

    pipeline.flush();

    const handled = events.filter((e) => e.type === 'segmenter-handle').length;
    const vadEvents = events.filter((e) => e.type === 'vad-event').length;

    expect(handled).toBeGreaterThan(0);
    expect(vadEvents).toBeGreaterThan(0);
  });

  it('reuses stage instances when controllers are equivalent', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    let created = 0;
    let configured = 0;
    let tornDown = 0;
    let setups = 0;

    const createStage = (): Stage => ({
      name: 'controller-stage',
      setup() {
        setups += 1;
      },
      handle() {
        // noop
      },
      teardown() {
        tornDown += 1;
      },
    });

    const controller = (key: string): StageController => ({
      id: 'controller-under-test',
      key,
      create: () => {
        created += 1;
        return createStage();
      },
      configure: () => {
        configured += 1;
      },
    });

    pipeline.configure({ stages: [controller('alpha')] });
    expect(created).toBe(1);
    expect(configured).toBe(1);
    expect(setups).toBe(1);
    expect(tornDown).toBe(0);

    pipeline.configure({ stages: [controller('alpha')] });
    expect(created).toBe(1);
    expect(configured).toBe(2);
    expect(setups).toBe(1);
    expect(tornDown).toBe(0);

    pipeline.configure({ stages: [controller('beta')] });
    expect(created).toBe(2);
    expect(configured).toBe(3);
    expect(setups).toBe(2);
    expect(tornDown).toBe(1);
  });

  it('tears down stages removed from configuration', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    const teardownTracker: Record<string, number> = {};

    const makeStage = (label: string): Stage => ({
      name: label,
      setup() {
        // noop
      },
      handle() {
        // noop
      },
      teardown() {
        teardownTracker[label] = (teardownTracker[label] ?? 0) + 1;
      },
    });

    const controller = (label: string): StageController => ({
      id: `controller-${label}`,
      key: label,
      create: () => makeStage(label),
    });

    pipeline.configure({ stages: [controller('one'), controller('two')] });
    expect(Object.values(teardownTracker).reduce((a, b) => a + b, 0)).toBe(0);

    pipeline.configure({ stages: [controller('one')] });
    expect(teardownTracker.two).toBe(1);
    expect(teardownTracker.one ?? 0).toBe(0);
  });

  it('buffers frames until a configuration is applied', () => {
    const handled: number[] = [];
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    const frame = (value: number, ts: number): Frame => ({
      pcm: new Float32Array([value]),
      tsMs: ts,
      sampleRate: 16000,
      channels: 1,
    });

    pipeline.push(frame(0.1, 0));
    pipeline.push(frame(0.5, 5));

    const stage: Stage = {
      name: 'buffer-test',
      setup() {
        // noop
      },
      handle(f) {
        handled.push(f.tsMs);
      },
    };

    pipeline.configure({ stages: [stage] });

    expect(handled).toEqual([0, 5]);
  });

  it('tears down plain stage instances on reconfigure', () => {
    let teardown = 0;
    const stage: Stage = {
      name: 'plain-stage',
      setup() {
        // noop
      },
      handle() {
        // noop
      },
      teardown() {
        teardown += 1;
      },
    };

    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    pipeline.configure({ stages: [stage] });
    expect(teardown).toBe(0);

    pipeline.configure({ stages: [stage] });
    expect(teardown).toBe(1);
  });

  it('uses symmetric isEqual when provided even if keys are absent', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'id',
    });

    let createCount = 0;
    const controller = (_label: string): StageController => ({
      id: 'custom-equal',
      // no key -> force isEqual path
      create: () => {
        createCount += 1;
        return {
          name: 'custom-equal-stage',
          setup() {},
          handle() {},
        } satisfies Stage;
      },
      configure() {},
      isEqual(other) {
        return other.id === 'custom-equal';
      },
    });

    pipeline.configure({ stages: [controller('a')] });
    pipeline.configure({ stages: [controller('b')] });

    expect(createCount).toBe(1);
  });
});
