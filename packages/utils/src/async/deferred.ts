export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

/**
 * Minimal Deferred helper for tests and orchestrators.
 * No non-null assertions; handlers are assigned synchronously in the Promise constructor.
 */
export function createDeferred<T = void>(): Deferred<T> {
  let resolveHandler: (value: T) => void = () => {
    throw new Error('Deferred.resolve called before initialization');
  };
  let rejectHandler: (reason?: unknown) => void = () => {
    throw new Error('Deferred.reject called before initialization');
  };

  const promise = new Promise<T>((resolve, reject) => {
    resolveHandler = resolve;
    rejectHandler = reject;
  });

  return {
    promise,
    resolve: (value: T) => resolveHandler(value),
    reject: (reason?: unknown) => rejectHandler(reason),
  };
}
