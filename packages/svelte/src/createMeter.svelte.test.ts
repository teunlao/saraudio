import { Pipeline } from '@saraudio/core';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createMeter } from './createMeter.svelte';

describe('createMeter', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('initializes with default values', () => {
    cleanup = $effect.root(() => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      const meter = createMeter({ pipeline });

      expect(meter.rms).toBe(0);
      expect(meter.peak).toBe(0);
      expect(meter.db).toBe(-Infinity);
    });
  });

  it('updates values when pipeline emits meter event', () => {
    cleanup = $effect.root(() => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      const meter = createMeter({ pipeline });

      flushSync(); // Ensure effect runs and subscription is set up

      pipeline.events.emit('meter', {
        rms: 0.5,
        peak: 0.8,
        db: -6,
        tsMs: 100,
      });

      flushSync();

      expect(meter.rms).toBe(0.5);
      expect(meter.peak).toBe(0.8);
      expect(meter.db).toBe(-6);
    });
  });

  it('calls onMeter callback', () => {
    cleanup = $effect.root(() => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      let called = false;
      createMeter({
        pipeline,
        onMeter: () => {
          called = true;
        },
      });

      flushSync(); // Ensure effect runs and subscription is set up

      pipeline.events.emit('meter', {
        rms: 0.5,
        peak: 0.8,
        db: -6,
        tsMs: 100,
      });

      flushSync();

      expect(called).toBe(true);
    });
  });

  it('resets values to defaults', () => {
    cleanup = $effect.root(() => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      const meter = createMeter({ pipeline });

      pipeline.events.emit('meter', {
        rms: 0.5,
        peak: 0.8,
        db: -6,
        tsMs: 100,
      });

      flushSync();

      meter.reset();

      expect(meter.rms).toBe(0);
      expect(meter.peak).toBe(0);
      expect(meter.db).toBe(-Infinity);
    });
  });

  it('handles null pipeline', () => {
    cleanup = $effect.root(() => {
      const meter = createMeter({ pipeline: null });

      expect(meter.rms).toBe(0);
      expect(meter.peak).toBe(0);
      expect(meter.db).toBe(-Infinity);
    });
  });

  it('accepts plain pipeline object', () => {
    cleanup = $effect.root(() => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      const meter = createMeter({ pipeline });

      flushSync(); // Ensure effect runs and subscription is set up

      pipeline.events.emit('meter', {
        rms: 0.5,
        peak: 0.8,
        db: -6,
        tsMs: 100,
      });

      flushSync();

      expect(meter.rms).toBe(0.5);
      expect(meter.peak).toBe(0.8);
      expect(meter.db).toBe(-6);
    });
  });
});
