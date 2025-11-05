import type { StreamStatus, TranscriptResult, Transport } from '@saraudio/core';
import type { TranscriptionController } from '../transcription/transcription-controller';

export interface TranscriptionControllerStubOptions {
  initialStatus?: StreamStatus;
  transport?: Transport;
  initialError?: Error | null;
}

export interface TranscriptionControllerStub extends TranscriptionController {
  // Test helpers to emit events
  emitTranscript(result: TranscriptResult): void;
  emitPartial(text: string): void;
  emitError(error: Error): void;
  emitStatus(status: StreamStatus): void;
  // Access to handlers for verification
  transcriptHandlers: Set<(result: TranscriptResult) => void>;
  partialHandlers: Set<(text: string) => void>;
  errorHandlers: Set<(error: Error) => void>;
  statusHandlers: Set<(status: StreamStatus) => void>;
  // Mutable state for testing
  setStatus(status: StreamStatus): void;
  setError(error: Error | null): void;
  setConnected(connected: boolean): void;
}

/**
 * Creates a transcription controller stub for testing purposes.
 * Provides full TranscriptionController interface with event emission helpers.
 *
 * Universal stub without test framework dependencies (no vi.fn(), etc).
 *
 * @example
 * ```ts
 * const stub = createTranscriptionControllerStub();
 *
 * const transcripts: TranscriptResult[] = [];
 * stub.onTranscript(t => transcripts.push(t));
 *
 * stub.emitTranscript({ text: 'hello', language: 'en-US' });
 * expect(transcripts).toHaveLength(1);
 *
 * // If you need vi.fn() - wrap yourself:
 * stub.connect = vi.fn(stub.connect);
 * ```
 */
export function createTranscriptionControllerStub(
  options: TranscriptionControllerStubOptions = {},
): TranscriptionControllerStub {
  const transcriptHandlers = new Set<(result: TranscriptResult) => void>();
  const partialHandlers = new Set<(text: string) => void>();
  const errorHandlers = new Set<(error: Error) => void>();
  const statusHandlers = new Set<(status: StreamStatus) => void>();

  let status: StreamStatus = options.initialStatus ?? 'idle';
  let isConnected = false;
  let lastError: Error | null = options.initialError ?? null;
  const transport: Transport = options.transport ?? 'websocket';

  const stub: TranscriptionControllerStub = {
    // State
    get status() {
      return status;
    },
    get transport() {
      return transport;
    },
    get error() {
      return lastError;
    },
    get isConnected() {
      return isConnected;
    },

    // Lifecycle
    async connect() {
      status = 'connected';
      isConnected = true;
      statusHandlers.forEach((handler) => handler(status));
    },
    async disconnect() {
      status = 'disconnected';
      isConnected = false;
      statusHandlers.forEach((handler) => handler(status));
    },
    clear() {
      // no-op in stub
    },
    async forceEndpoint() {
      // no-op in stub
    },

    // Event subscriptions
    onPartial(handler) {
      partialHandlers.add(handler);
      return () => partialHandlers.delete(handler);
    },
    onTranscript(handler) {
      transcriptHandlers.add(handler);
      return () => transcriptHandlers.delete(handler);
    },
    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
    onStatusChange(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },

    // Test helpers - emit events
    emitTranscript(result) {
      transcriptHandlers.forEach((handler) => handler(result));
    },
    emitPartial(text) {
      partialHandlers.forEach((handler) => handler(text));
    },
    emitError(err) {
      lastError = err;
      errorHandlers.forEach((handler) => handler(err));
    },
    emitStatus(next) {
      status = next;
      if (next === 'connected') {
        isConnected = true;
      } else if (next === 'disconnected') {
        isConnected = false;
      }
      statusHandlers.forEach((handler) => handler(next));
    },

    // Test helpers - access handlers
    transcriptHandlers,
    partialHandlers,
    errorHandlers,
    statusHandlers,

    // Test helpers - mutate state
    setStatus(newStatus) {
      status = newStatus;
    },
    setError(newError) {
      lastError = newError;
    },
    setConnected(connected) {
      isConnected = connected;
    },
  };

  return stub;
}
