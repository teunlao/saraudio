export interface SocketEventMap {
  open: Event;
  close: CloseEventLike;
  error: Event;
  message: MessageEventLike;
}

export interface MessageEventLike {
  data: ArrayBuffer | string;
}

export interface CloseEventLike {
  code: number;
  reason: string;
  wasClean?: boolean;
}

/**
 * Minimal WebSocket-like interface to decouple providers from platform specifics.
 */
export interface SocketLike {
  readonly readyState: number;
  send(data: ArrayBufferView | ArrayBuffer | string): void;
  close(code?: number, reason?: string): void;
  addEventListener<K extends keyof SocketEventMap>(type: K, listener: (ev: SocketEventMap[K]) => void): void;
  removeEventListener<K extends keyof SocketEventMap>(type: K, listener: (ev: SocketEventMap[K]) => void): void;
}

/**
 * Factory to create SocketLike for a given URL.
 */
export type SocketFactory = (
  url: string,
  options?: { protocols?: string[]; headers?: Record<string, string> },
) => SocketLike | Promise<SocketLike>;
