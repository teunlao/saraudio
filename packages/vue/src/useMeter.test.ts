import { Pipeline } from '@saraudio/core';
import { afterEach, describe, expect, it } from 'vitest';
import { type Ref, ref } from 'vue';
import { withSetup } from './test-utils/withSetup';
import { useMeter } from './useMeter';

describe('useMeter', () => {
  let apps: ReturnType<typeof withSetup>[1][] = [];

  afterEach(() => {
    for (const app of apps) {
      app.unmount();
    }
    apps = [];
  });

  it('initializes with default values', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    const [meter, app] = withSetup(() => useMeter({ pipeline: ref(pipeline) as Ref<Pipeline> }));
    apps.push(app);

    expect(meter.rms.value).toBe(0);
    expect(meter.peak.value).toBe(0);
    expect(meter.db.value).toBe(-Infinity);
  });

  it('updates values when pipeline emits meter event', async () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    const [meter, app] = withSetup(() => useMeter({ pipeline: ref(pipeline) as Ref<Pipeline> }));
    apps.push(app);

    // Simulate meter event
    pipeline.events.emit('meter', {
      rms: 0.5,
      peak: 0.8,
      db: -6,
      tsMs: 100,
    });

    expect(meter.rms.value).toBe(0.5);
    expect(meter.peak.value).toBe(0.8);
    expect(meter.db.value).toBe(-6);
  });

  it('calls onMeter callback', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    let called = false;
    const [, app] = withSetup(() =>
      useMeter({
        pipeline: ref(pipeline) as Ref<Pipeline>,
        onMeter: () => {
          called = true;
        },
      }),
    );
    apps.push(app);

    pipeline.events.emit('meter', {
      rms: 0.5,
      peak: 0.8,
      db: -6,
      tsMs: 100,
    });

    expect(called).toBe(true);
  });

  it('resets values to defaults', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    const [meter, app] = withSetup(() => useMeter({ pipeline: ref(pipeline) as Ref<Pipeline> }));
    apps.push(app);

    pipeline.events.emit('meter', {
      rms: 0.5,
      peak: 0.8,
      db: -6,
      tsMs: 100,
    });

    meter.reset();

    expect(meter.rms.value).toBe(0);
    expect(meter.peak.value).toBe(0);
    expect(meter.db.value).toBe(-Infinity);
  });

  it('handles null pipeline', () => {
    const [meter, app] = withSetup(() => useMeter({ pipeline: ref(null) }));
    apps.push(app);

    expect(meter.rms.value).toBe(0);
    expect(meter.peak.value).toBe(0);
    expect(meter.db.value).toBe(-Infinity);
  });

  it('accepts plain pipeline object', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    const [meter, app] = withSetup(() => useMeter({ pipeline }));
    apps.push(app);

    pipeline.events.emit('meter', {
      rms: 0.5,
      peak: 0.8,
      db: -6,
      tsMs: 100,
    });

    expect(meter.rms.value).toBe(0.5);
    expect(meter.peak.value).toBe(0.8);
    expect(meter.db.value).toBe(-6);
  });
});
