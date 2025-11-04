import { describe, expect, it } from 'vitest';
import type { StageController } from '../pipeline';
import { createSubscription, isStageController } from './helpers';

describe('isStageController', () => {
  it('returns true for valid StageController', () => {
    const controller: StageController = {
      id: 'test-stage',
      create: () => ({
        setup: () => {},
        handle: () => {},
      }),
    };
    expect(isStageController(controller)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isStageController(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isStageController(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isStageController('string')).toBe(false);
    expect(isStageController(123)).toBe(false);
    expect(isStageController(true)).toBe(false);
  });

  it('returns false for object without create method', () => {
    expect(isStageController({ id: 'test' })).toBe(false);
  });

  it('returns false for object with non-function create', () => {
    expect(isStageController({ create: 'not-a-function' })).toBe(false);
  });
});

describe('createSubscription', () => {
  it('adds handler to set and returns unsubscribe handle', () => {
    const handlers = new Set<(value: number) => void>();
    const handler = (value: number) => value;

    const subscription = createSubscription(handlers, handler);

    expect(handlers.has(handler)).toBe(true);
    expect(subscription).toHaveProperty('unsubscribe');
  });

  it('removes handler from set when unsubscribe is called', () => {
    const handlers = new Set<(value: number) => void>();
    const handler = (value: number) => value;

    const subscription = createSubscription(handlers, handler);
    expect(handlers.has(handler)).toBe(true);

    subscription.unsubscribe();
    expect(handlers.has(handler)).toBe(false);
  });

  it('works with multiple handlers', () => {
    const handlers = new Set<(value: string) => void>();
    const handler1 = (value: string) => value;
    const handler2 = (value: string) => value;

    const sub1 = createSubscription(handlers, handler1);
    const sub2 = createSubscription(handlers, handler2);

    expect(handlers.size).toBe(2);

    sub1.unsubscribe();
    expect(handlers.size).toBe(1);
    expect(handlers.has(handler2)).toBe(true);

    sub2.unsubscribe();
    expect(handlers.size).toBe(0);
  });
});
