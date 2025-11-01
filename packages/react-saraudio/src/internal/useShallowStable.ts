import { useRef } from 'react';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

export function useShallowStable<T>(value: T): T {
  const ref = useRef<T>(value);
  const prev = ref.current;

  if (prev === value) {
    return prev;
  }

  if (isObject(prev) && isObject(value) && shallowEqual(prev, value)) {
    return prev as T;
  }

  ref.current = value;
  return value;
}
