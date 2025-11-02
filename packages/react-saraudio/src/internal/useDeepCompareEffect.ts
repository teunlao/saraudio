import { useEffect, useMemo, useRef } from 'react';

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}

function useDeepCompareMemoize(dependencies: unknown[]): unknown[] {
  const dependenciesRef = useRef<unknown[]>(dependencies);
  const signalRef = useRef<number>(0);

  if (!deepEqual(dependencies, dependenciesRef.current)) {
    dependenciesRef.current = dependencies;
    signalRef.current += 1;
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: signal is the trigger
  return useMemo(() => dependenciesRef.current, [signalRef.current]);
}

export function useDeepCompareEffect(effect: () => void | (() => void), deps: unknown[]): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: memoized deps
  useEffect(effect, useDeepCompareMemoize(deps));
}
