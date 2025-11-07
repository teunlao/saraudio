import { randomUUID } from 'node:crypto';
import { createLogger, type Logger } from '@saraudio/utils';
import type { RuntimeOptions, RuntimeServices } from '../types';

const createDefaultLogger = (): Logger => createLogger({ level: 'info', namespace: 'saraudio:runtime-node' });

const defaultClock = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const defaultCreateId = () => {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  const random = Math.random().toString(16).slice(2);
  return `segment-${random}`;
};

export const createRuntimeServices = (options?: RuntimeOptions): RuntimeServices => {
  const overrides = options?.services ?? {};

  const logger = overrides.logger ?? createDefaultLogger();
  const clock = overrides.clock ?? defaultClock;
  const createId = overrides.createId ?? defaultCreateId;

  return {
    logger,
    clock,
    createId,
  };
};
