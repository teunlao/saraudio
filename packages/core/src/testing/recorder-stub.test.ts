import { describe, expect, it } from 'vitest';
import { createRecorderStub } from './recorder-stub';

describe('createRecorderStub', () => {
  it('creates a stub with default state', () => {
    const stub = createRecorderStub();

    expect(stub.status).toBe('idle');
    expect(stub.error).toBe(null);
    expect(stub.pipeline).toBeDefined();
  });

  it('emits VAD events to subscribers', () => {
    const stub = createRecorderStub();
    const vads: Array<{ score: number; speech: boolean; tsMs: number }> = [];

    stub.onVad((v) => vads.push(v));

    stub.emitVad({ score: 0.9, speech: true, tsMs: 100 });
    stub.emitVad({ score: 0.1, speech: false, tsMs: 200 });

    expect(vads).toHaveLength(2);
    expect(vads[0]).toEqual({ score: 0.9, speech: true, tsMs: 100 });
    expect(vads[1]).toEqual({ score: 0.1, speech: false, tsMs: 200 });
  });

  it('emits segment events to subscribers', () => {
    const stub = createRecorderStub();
    const segments: Array<{ id: string }> = [];

    stub.onSegment((s) => segments.push({ id: s.id }));

    stub.emitSegment({
      id: 'seg-1',
      pcm: new Int16Array(),
      startMs: 0,
      endMs: 100,
      durationMs: 100,
      sampleRate: 16000,
      channels: 1,
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].id).toBe('seg-1');
  });

  it('allows mutating status and error', () => {
    const stub = createRecorderStub();

    expect(stub.status).toBe('idle');
    stub.setStatus('running');
    expect(stub.status).toBe('running');

    expect(stub.error).toBe(null);
    const error = new Error('test error');
    stub.setError(error);
    expect(stub.error).toBe(error);
  });

  it('supports unsubscribing', () => {
    const stub = createRecorderStub();
    const vads: Array<{ score: number }> = [];

    const unsubscribe = stub.onVad((v) => vads.push({ score: v.score }));

    stub.emitVad({ score: 0.5, speech: true, tsMs: 100 });
    expect(vads).toHaveLength(1);

    unsubscribe();
    stub.emitVad({ score: 0.8, speech: true, tsMs: 200 });
    expect(vads).toHaveLength(1); // Still 1, not 2
  });

  it('can be initialized with custom state', () => {
    const initialError = new Error('init error');
    const stub = createRecorderStub({
      initialStatus: 'error',
      initialError,
    });

    expect(stub.status).toBe('error');
    expect(stub.error).toBe(initialError);
  });
});
