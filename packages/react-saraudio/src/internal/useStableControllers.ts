import type { StageController } from '@saraudio/core';
import { useRef } from 'react';

const controllersMatch = (a: StageController | undefined, b: StageController): boolean => {
  if (!a) return false;
  if (a === b) return true;
  if (a.id !== b.id) return false;
  if (typeof a.isEqual === 'function') return a.isEqual(b);
  if (typeof b.isEqual === 'function') return b.isEqual(a);
  if (a.metadata !== undefined || b.metadata !== undefined) {
    return a.metadata === b.metadata;
  }
  return false;
};

export function useStableControllers(controllers: StageController[] | undefined): StageController[] | undefined {
  const ref = useRef<StageController[] | undefined>(undefined);
  const previous = ref.current;

  if (!controllers) {
    ref.current = undefined;
    return undefined;
  }

  if (!previous || previous.length !== controllers.length) {
    const next = [...controllers];
    ref.current = next;
    return next;
  }

  let changed = false;
  const next = controllers.map((controller, index) => {
    const prevController = previous[index];
    if (prevController && controllersMatch(prevController, controller)) {
      return prevController;
    }
    changed = true;
    return controller;
  });

  if (!changed) {
    return previous;
  }

  ref.current = next;
  return next;
}
