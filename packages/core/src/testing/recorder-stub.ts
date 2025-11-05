import type { NormalizedFrame, RecorderFrameEncoding } from '../format';
import { Pipeline } from '../pipeline';
import type { Recorder } from '../recorder/types';
import type { CoreError, Frame, Segment, VADScore } from '../types';

export interface RecorderStubOptions<_E extends RecorderFrameEncoding = 'pcm16'> {
  initialStatus?: 'idle' | 'acquiring' | 'running' | 'stopping' | 'error';
  initialError?: Error | null;
}

export interface RecorderStub<E extends RecorderFrameEncoding = 'pcm16'> extends Recorder<E> {
  // Test helpers to emit events
  emitVad(payload: VADScore): void;
  emitSegment(segment: Segment): void;
  emitError(error: CoreError): void;
  emitRawFrame(frame: Frame): void;
  emitSpeechFrame(frame: Frame): void;
  emitNormalizedFrame(frame: NormalizedFrame<E>): void;
  emitReady(): void;
  // Access to handlers for verification
  vadHandlers: Set<(payload: VADScore) => void>;
  segmentHandlers: Set<(segment: Segment) => void>;
  errorHandlers: Set<(error: CoreError) => void>;
  rawFrameHandlers: Set<(frame: Frame) => void>;
  speechFrameHandlers: Set<(frame: Frame) => void>;
  normalizedFrameHandlers: Set<(frame: NormalizedFrame<E>) => void>;
  readyHandlers: Set<() => void>;
  // Mutable state for testing
  setStatus(status: 'idle' | 'acquiring' | 'running' | 'stopping' | 'error'): void;
  setError(error: Error | null): void;
}

/**
 * Creates a recorder stub for testing purposes.
 * Provides full Recorder interface with event emission helpers.
 *
 * Universal stub without test framework dependencies (no vi.fn(), etc).
 *
 * @example
 * ```ts
 * const stub = createRecorderStub();
 *
 * const vads: VADScore[] = [];
 * stub.onVad(v => vads.push(v));
 *
 * stub.emitVad({ score: 0.9, speech: true, tsMs: 100 });
 * expect(vads).toHaveLength(1);
 *
 * // If you need vi.fn() - wrap yourself:
 * stub.start = vi.fn(stub.start);
 * ```
 */
export function createRecorderStub<E extends RecorderFrameEncoding = 'pcm16'>(
  options: RecorderStubOptions<E> = {},
): RecorderStub<E> {
  let status = options.initialStatus ?? 'idle';
  let error = options.initialError ?? null;

  // Event handlers
  const vadHandlers = new Set<(payload: VADScore) => void>();
  const segmentHandlers = new Set<(segment: Segment) => void>();
  const errorHandlers = new Set<(error: CoreError) => void>();
  const rawFrameHandlers = new Set<(frame: Frame) => void>();
  const speechFrameHandlers = new Set<(frame: Frame) => void>();
  const normalizedFrameHandlers = new Set<(frame: NormalizedFrame<E>) => void>();
  const readyHandlers = new Set<() => void>();

  const pipeline = new Pipeline({ now: () => Date.now(), createId: () => `id-${Date.now()}` });

  const stub: RecorderStub<E> = {
    // State
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    pipeline,

    // Lifecycle
    async start() {
      status = 'running';
    },
    async stop() {
      status = 'idle';
    },
    reset() {
      error = null;
    },
    dispose() {
      pipeline.dispose();
    },

    // Configuration
    async configure() {},
    async update(_options?: unknown) {},

    // Event subscriptions
    onVad(handler) {
      vadHandlers.add(handler);
      return () => vadHandlers.delete(handler);
    },
    onSegment(handler) {
      segmentHandlers.add(handler);
      return () => segmentHandlers.delete(handler);
    },
    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
    subscribeRawFrames(handler) {
      rawFrameHandlers.add(handler);
      return () => rawFrameHandlers.delete(handler);
    },
    subscribeSpeechFrames(handler) {
      speechFrameHandlers.add(handler);
      return () => speechFrameHandlers.delete(handler);
    },
    subscribeFrames(handler) {
      normalizedFrameHandlers.add(handler);
      return () => normalizedFrameHandlers.delete(handler);
    },
    onReady(handler) {
      readyHandlers.add(handler);
      return () => readyHandlers.delete(handler);
    },

    // Recordings (minimal implementation)
    recordings: {
      cleaned: { durationMs: 0 },
      full: { durationMs: 0 },
      masked: { durationMs: 0 },
      meta() {
        return { sessionDurationMs: 0, cleanedDurationMs: 0 };
      },
      clear() {},
    },

    // Test helpers - emit events
    emitVad(payload) {
      vadHandlers.forEach((h) => h(payload));
    },
    emitSegment(segment) {
      segmentHandlers.forEach((h) => h(segment));
    },
    emitError(err) {
      errorHandlers.forEach((h) => h(err));
    },
    emitRawFrame(frame) {
      rawFrameHandlers.forEach((h) => h(frame));
    },
    emitSpeechFrame(frame) {
      speechFrameHandlers.forEach((h) => h(frame));
    },
    emitNormalizedFrame(frame) {
      normalizedFrameHandlers.forEach((h) => h(frame));
    },
    emitReady() {
      readyHandlers.forEach((h) => h());
    },

    // Test helpers - access handlers
    vadHandlers,
    segmentHandlers,
    errorHandlers,
    rawFrameHandlers,
    speechFrameHandlers,
    normalizedFrameHandlers,
    readyHandlers,

    // Test helpers - mutate state
    setStatus(newStatus) {
      status = newStatus;
    },
    setError(newError) {
      error = newError;
    },
  };

  return stub;
}
