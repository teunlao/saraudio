import { Pipeline } from '@saraudio/core';
import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { createMeter } from './createMeter';

describe('createMeter', () => {
  afterEach(() => {
    // cleanup if needed
  });

  it('initializes with default values', () => {
    const TestComponent = () => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      const meter = createMeter({ pipeline });

      expect(meter.rms()).toBe(0);
      expect(meter.peak()).toBe(0);
      expect(meter.db()).toBe(-Infinity);

      return null;
    };

    render(() => <TestComponent />);
  });

  it('updates values when pipeline emits meter event', async () => {
    const TestComponent = () => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      const meter = createMeter({ pipeline });

      setTimeout(() => {
        pipeline.events.emit('meter', {
          rms: 0.5,
          peak: 0.8,
          db: -6,
          tsMs: 100,
        });

        setTimeout(() => {
          expect(meter.rms()).toBe(0.5);
          expect(meter.peak()).toBe(0.8);
          expect(meter.db()).toBe(-6);
        }, 10);
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('calls onMeter callback', async () => {
    const TestComponent = () => {
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

      setTimeout(() => {
        pipeline.events.emit('meter', {
          rms: 0.5,
          peak: 0.8,
          db: -6,
          tsMs: 100,
        });

        setTimeout(() => {
          expect(called).toBe(true);
        }, 10);
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('resets values to defaults', async () => {
    const TestComponent = () => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      const meter = createMeter({ pipeline });

      setTimeout(() => {
        pipeline.events.emit('meter', {
          rms: 0.5,
          peak: 0.8,
          db: -6,
          tsMs: 100,
        });

        setTimeout(() => {
          meter.reset();
          expect(meter.rms()).toBe(0);
          expect(meter.peak()).toBe(0);
          expect(meter.db()).toBe(-Infinity);
        }, 10);
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('handles null pipeline', () => {
    const TestComponent = () => {
      const meter = createMeter({ pipeline: null });

      expect(meter.rms()).toBe(0);
      expect(meter.peak()).toBe(0);
      expect(meter.db()).toBe(-Infinity);

      return null;
    };

    render(() => <TestComponent />);
  });

  it('accepts plain pipeline object', async () => {
    const TestComponent = () => {
      const pipeline = new Pipeline({
        now: () => 0,
        createId: () => 'test-id',
      });

      const meter = createMeter({ pipeline });

      setTimeout(() => {
        pipeline.events.emit('meter', {
          rms: 0.5,
          peak: 0.8,
          db: -6,
          tsMs: 100,
        });

        setTimeout(() => {
          expect(meter.rms()).toBe(0.5);
          expect(meter.peak()).toBe(0.8);
          expect(meter.db()).toBe(-6);
        }, 10);
      }, 10);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
