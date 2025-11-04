export abstract class TranscriptionError extends Error {
  readonly name: string = 'TranscriptionError';
  readonly cause?: unknown;
  readonly ts = Date.now();
  protected constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export class AuthenticationError extends TranscriptionError {
  readonly name = 'AuthenticationError';
  constructor(message = 'Authentication failed', cause?: unknown) {
    super(message, cause);
  }
}

export class NetworkError extends TranscriptionError {
  readonly name = 'NetworkError';
  constructor(
    message = 'Network error',
    public readonly transient = true,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

export class RateLimitError extends TranscriptionError {
  readonly name = 'RateLimitError';
  constructor(
    message = 'Rate limited',
    public readonly retryAfterMs?: number,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

export class TimeoutError extends TranscriptionError {
  readonly name = 'TimeoutError';
  constructor(
    message = 'Operation timed out',
    public readonly operation: 'connect' | 'send' | 'receive' | 'flush' | 'transcribe',
    public readonly timeoutMs: number,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

import type { RecorderFormatOptions } from '../format';

export class FormatMismatchError extends TranscriptionError {
  readonly name = 'FormatMismatchError';
  constructor(
    message = 'Recorder format is not supported',
    public readonly expected: Readonly<RecorderFormatOptions>,
    public readonly received: Readonly<RecorderFormatOptions>,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

export class ProviderError extends TranscriptionError {
  readonly name = 'ProviderError';
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly providerCode?: string | number,
    public readonly status?: number,
    public readonly raw?: unknown,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

export class AbortedError extends TranscriptionError {
  readonly name = 'AbortedError';
  constructor(message = 'Operation aborted', cause?: unknown) {
    super(message, cause);
  }
}

/** Helper for retry policies in higher layers. */
export function isRetryable(err: unknown): err is NetworkError | RateLimitError | TimeoutError {
  return err instanceof NetworkError || err instanceof RateLimitError || err instanceof TimeoutError;
}
