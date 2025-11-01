import type { Stage } from '@saraudio/core';
import { useEffect, useMemo } from 'react';

export type StageLoader = () => Promise<Stage> | Stage;
export type StageInput = StageLoader | string | Stage;

interface StableLoader extends StageLoader {
  _latestRef: { current: StageLoader };
}

function isLoader(value: unknown): value is StageLoader {
  return typeof value === 'function';
}

function createStableWrapper(loader: StageLoader): StableLoader {
  const latestRef = { current: loader };
  const wrapper: StableLoader = Object.assign(() => latestRef.current(), {
    _latestRef: latestRef,
  });
  return wrapper;
}

export function useStableLoaders(inputs: StageInput[] | undefined): StageInput[] | undefined {
  const wrappers = useMemo(() => {
    if (!inputs) return undefined;

    return inputs.map((item) => (isLoader(item) ? createStableWrapper(item) : item));
  }, [inputs]);

  useEffect(() => {
    if (!inputs || !wrappers) return;

    for (let i = 0; i < Math.min(inputs.length, wrappers.length); i++) {
      const input = inputs[i];
      const wrapper = wrappers[i];

      if (isLoader(input) && isLoader(wrapper)) {
        const stableWrapper = wrapper as StableLoader;
        stableWrapper._latestRef.current = input;
      }
    }
  }, [inputs, wrappers]);

  return wrappers;
}
