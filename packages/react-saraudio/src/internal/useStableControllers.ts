import type { StageController } from '@saraudio/core';
import { useRef } from 'react';

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

  for (let i = 0; i < controllers.length; i += 1) {
    if (previous[i] !== controllers[i]) {
      const next = [...controllers];
      ref.current = next;
      return next;
    }
  }

  return previous;
}
