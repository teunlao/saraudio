import type { SocketFactory } from './socket';

let defaultSocketFactory: SocketFactory | null = null;

/**
 * Register a process‑wide default SocketFactory. Platform runtimes should call this
 * once (e.g., browser uses window.WebSocket; node uses ws/undici).
 */
export function registerSocketFactory(factory: SocketFactory): void {
  defaultSocketFactory = factory;
}

/**
 * Returns the registered SocketFactory, or null if none is registered.
 * Providers should use this to remain platform‑agnostic.
 */
export function getRegisteredSocketFactory(): SocketFactory | null {
  return defaultSocketFactory;
}

