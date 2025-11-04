import type { StageController } from '../pipeline';
import type { SubscribeHandle } from './types';

export const isStageController = (value: unknown): value is StageController =>
  typeof value === 'object' && value !== null && typeof (value as StageController).create === 'function';

export const createSubscription = <T>(set: Set<(value: T) => void>, handler: (value: T) => void): SubscribeHandle => {
  set.add(handler);
  return {
    unsubscribe() {
      set.delete(handler);
    },
  };
};
