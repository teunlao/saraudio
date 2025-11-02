import { vi } from 'vitest';

if (typeof crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => Math.random().toString(16).slice(2),
    },
  });
}

if (typeof performance === 'undefined') {
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: {
      now: () => Date.now(),
    },
  });
}

vi.spyOn(console, 'error').mockImplementation(() => {
  // silence expected errors during tests
});
