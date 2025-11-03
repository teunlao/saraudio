import type { Frame, MeterPayload } from '@saraudio/core';
import { Pipeline } from '@saraudio/core';
import { createAudioMeterStage } from '@saraudio/meter';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMeter } from './useMeter';

describe('useMeter', () => {
  it('returns initial state before meter events', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    const { result } = renderHook(() => useMeter({ pipeline }));

    expect(result.current.rms).toBe(0);
    expect(result.current.peak).toBe(0);
    expect(result.current.db).toBe(-Infinity);
  });

  it('updates state when meter events are emitted', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    const meterStage = createAudioMeterStage();
    pipeline.use(meterStage);

    const { result } = renderHook(() => useMeter({ pipeline }));

    const frame: Frame = {
      pcm: new Float32Array([0.5, 0.5, 0.5]),
      tsMs: 100,
      sampleRate: 16000,
      channels: 1,
    };

    act(() => {
      pipeline.push(frame);
    });

    expect(result.current.rms).toBeGreaterThan(0);
    expect(result.current.peak).toBeGreaterThan(0);
    expect(result.current.db).toBeGreaterThan(-Infinity);
  });

  it('calls onMeter callback when provided', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    const meterStage = createAudioMeterStage();
    pipeline.use(meterStage);

    const meterPayloads: MeterPayload[] = [];
    renderHook(() =>
      useMeter({
        pipeline,
        onMeter: (payload) => {
          meterPayloads.push(payload);
        },
      }),
    );

    const frame: Frame = {
      pcm: new Float32Array([0.8, 0.8]),
      tsMs: 200,
      sampleRate: 16000,
      channels: 1,
    };

    act(() => {
      pipeline.push(frame);
    });

    expect(meterPayloads).toHaveLength(1);
    expect(meterPayloads[0]?.tsMs).toBe(200);
    expect(meterPayloads[0]?.rms).toBeCloseTo(0.8, 1);
  });

  it('resets state when pipeline changes', () => {
    const pipeline1 = new Pipeline({
      now: () => 0,
      createId: () => 'test-id-1',
    });

    const meterStage1 = createAudioMeterStage();
    pipeline1.use(meterStage1);

    const { result, rerender } = renderHook(({ pipeline }) => useMeter({ pipeline }), {
      initialProps: { pipeline: pipeline1 },
    });

    const frame1: Frame = {
      pcm: new Float32Array([0.9, 0.9]),
      tsMs: 100,
      sampleRate: 16000,
      channels: 1,
    };

    act(() => {
      pipeline1.push(frame1);
    });

    expect(result.current.rms).toBeGreaterThan(0);

    const pipeline2 = new Pipeline({
      now: () => 0,
      createId: () => 'test-id-2',
    });

    const meterStage2 = createAudioMeterStage();
    pipeline2.use(meterStage2);

    rerender({ pipeline: pipeline2 });

    expect(result.current.rms).toBe(0);
    expect(result.current.peak).toBe(0);
    expect(result.current.db).toBe(-Infinity);
  });

  it('resets values to defaults', () => {
    const pipeline = new Pipeline({
      now: () => 0,
      createId: () => 'test-id',
    });

    const meterStage = createAudioMeterStage();
    pipeline.use(meterStage);

    const { result } = renderHook(() => useMeter({ pipeline }));

    const frame: Frame = {
      pcm: new Float32Array([0.5, 0.5, 0.5]),
      tsMs: 100,
      sampleRate: 16000,
      channels: 1,
    };

    act(() => {
      pipeline.push(frame);
    });

    expect(result.current.rms).toBeGreaterThan(0);

    act(() => {
      result.current.reset();
    });

    expect(result.current.rms).toBe(0);
    expect(result.current.peak).toBe(0);
    expect(result.current.db).toBe(-Infinity);
  });

  it('handles null pipeline', () => {
    const { result } = renderHook(() => useMeter({ pipeline: null }));

    expect(result.current.rms).toBe(0);
    expect(result.current.peak).toBe(0);
    expect(result.current.db).toBe(-Infinity);
  });
});
