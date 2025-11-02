import type { Stage } from '@saraudio/core';
import { useEffect, useRef } from 'react';

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
  // Keep a stable array instance across renders to avoid recreating Recorder.
  // Only rebuild when the structure meaningfully changes (length or string ids differ).
  const stableRef = useRef<StageInput[] | undefined>(undefined);

  // Initialize once or when inputs structure changes in a detectable way.
  if (!inputs) {
    stableRef.current = undefined;
  } else if (!stableRef.current) {
    stableRef.current = inputs.map((item) => (isLoader(item) ? createStableWrapper(item) : item));
  } else {
    const prev = stableRef.current;
    let rebuild = false;

    if (prev.length !== inputs.length) {
      rebuild = true;
    } else {
      // If caller passes string ids, detect change by value to allow proper reconfig.
      for (let i = 0; i < inputs.length; i += 1) {
        if (typeof inputs[i] === 'string' || typeof prev[i] === 'string') {
          if (inputs[i] !== prev[i]) {
            rebuild = true;
            break;
          }
        }
      }
    }

    if (rebuild) {
      stableRef.current = inputs.map((item) => (isLoader(item) ? createStableWrapper(item) : item));
    }
  }

  // Keep loader functions up-to-date without changing wrapper identity.
  useEffect(() => {
    if (!inputs || !stableRef.current) return;
    for (let i = 0; i < Math.min(inputs.length, stableRef.current.length); i += 1) {
      const input = inputs[i];
      const current = stableRef.current[i];
      if (isLoader(input) && isLoader(current)) {
        (current as StableLoader)._latestRef.current = input;
      }
      // If a Stage instance is provided inline each render, we intentionally
      // keep the first seen instance to avoid thrashing. When the structure
      // truly changes (see rebuild above), we accept a new instance.
    }
  }, [inputs]);

  return stableRef.current;
}
