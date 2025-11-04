import { describe, expect, it, vi } from 'vitest';
import { Pipeline } from '../pipeline';
import { RecordingAssembler } from '../recording/recording-assembler';
import type { CoreError, Segment, VADScore } from '../types';
import { PipelineManager } from './pipeline-manager';

describe('PipelineManager', () => {
  const createTestPipeline = () =>
    new Pipeline({
      now: () => Date.now(),
      createId: () => `seg-${Date.now()}`,
    });

  const createTestAssembler = () =>
    new RecordingAssembler({
      collectCleaned: true,
      collectFull: true,
      collectMasked: true,
    });

  it('starts with isSegmentActive false', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    expect(manager.isSegmentActive).toBe(false);
  });

  it('sets isSegmentActive to true on speechStart event', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    manager.attach();
    pipeline.events.emit('speechStart', { tsMs: Date.now() });

    expect(manager.isSegmentActive).toBe(true);
  });

  it('sets isSegmentActive to false on speechEnd event', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    manager.attach();
    pipeline.events.emit('speechStart', { tsMs: Date.now() });
    expect(manager.isSegmentActive).toBe(true);

    pipeline.events.emit('speechEnd', { tsMs: Date.now() });
    expect(manager.isSegmentActive).toBe(false);
  });

  it('calls onVad callback when vad event is emitted', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onVad = vi.fn();
    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad,
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    manager.attach();
    const vadPayload: VADScore = { speech: true, score: 0.9, tsMs: Date.now() };
    pipeline.events.emit('vad', vadPayload);

    expect(onVad).toHaveBeenCalledWith(vadPayload);
  });

  it('calls onSegment callback when segment event is emitted', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onSegment = vi.fn();
    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad: vi.fn(),
        onSegment,
        onError: vi.fn(),
      },
    });

    manager.attach();
    const segment: Segment = {
      id: 'seg-1',
      pcm: new Int16Array([1, 2, 3]),
      sampleRate: 16000,
      channels: 1,
      startMs: 0,
      endMs: 100,
      durationMs: 100,
    };
    pipeline.events.emit('segment', segment);

    expect(onSegment).toHaveBeenCalledWith(segment);
  });

  it('calls onError callback when error event is emitted', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onError = vi.fn();
    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad: vi.fn(),
        onSegment: vi.fn(),
        onError,
      },
    });

    manager.attach();
    const error: CoreError = { code: 'TEST_ERROR', message: 'Test error' };
    pipeline.events.emit('error', error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('notifies assembler on speechStart and speechEnd', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onSpeechStartSpy = vi.spyOn(assembler, 'onSpeechStart');
    const onSpeechEndSpy = vi.spyOn(assembler, 'onSpeechEnd');

    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    manager.attach();
    pipeline.events.emit('speechStart', { tsMs: Date.now() });
    expect(onSpeechStartSpy).toHaveBeenCalled();

    pipeline.events.emit('speechEnd', { tsMs: Date.now() });
    expect(onSpeechEndSpy).toHaveBeenCalled();
  });

  it('notifies assembler on segment', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onSegmentSpy = vi.spyOn(assembler, 'onSegment');

    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    manager.attach();
    const segment: Segment = {
      id: 'seg-1',
      pcm: new Int16Array([1, 2, 3]),
      sampleRate: 16000,
      channels: 1,
      startMs: 0,
      endMs: 100,
      durationMs: 100,
    };
    pipeline.events.emit('segment', segment);

    expect(onSegmentSpy).toHaveBeenCalledWith(segment);
  });

  it('does not attach listeners twice', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onVad = vi.fn();

    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad,
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    manager.attach();
    manager.attach(); // Second attach should be no-op

    const vadPayload: VADScore = { speech: true, score: 0.9, tsMs: Date.now() };
    pipeline.events.emit('vad', vadPayload);

    expect(onVad).toHaveBeenCalledTimes(1);
  });

  it('detaches listeners successfully', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onVad = vi.fn();

    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad,
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    manager.attach();
    manager.detach();

    const vadPayload: VADScore = { speech: true, score: 0.9, tsMs: Date.now() };
    pipeline.events.emit('vad', vadPayload);

    expect(onVad).not.toHaveBeenCalled();
  });

  it('calls onWarn when detach fails', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onWarn = vi.fn();

    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
      onWarn,
    });

    manager.attach();

    // Force a detach error by replacing detachFunctions with throwing function
    const detachFunctions = (manager as unknown as { detachFunctions: Array<() => void> }).detachFunctions;
    detachFunctions.push(() => {
      throw new Error('Detach error');
    });

    manager.detach();

    expect(onWarn).toHaveBeenCalledWith('Pipeline detach failed', { error: expect.any(Error) });
  });

  it('dispose calls detach', () => {
    const pipeline = createTestPipeline();
    const assembler = createTestAssembler();
    const onVad = vi.fn();

    const manager = new PipelineManager({
      pipeline,
      assembler,
      callbacks: {
        onVad,
        onSegment: vi.fn(),
        onError: vi.fn(),
      },
    });

    manager.attach();
    manager.dispose();

    const vadPayload: VADScore = { speech: true, score: 0.9, tsMs: Date.now() };
    pipeline.events.emit('vad', vadPayload);

    expect(onVad).not.toHaveBeenCalled();
  });
});
