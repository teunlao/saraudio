import type { NormalizedFrame } from '@saraudio/core';
import { describe, expect, it } from 'vitest';
import { PreconnectBuffer } from './preconnect-buffer';

describe('PreconnectBuffer', () => {
  const createFrame = (samples: number, sampleRate = 16000, channels: 1 | 2 = 1): NormalizedFrame<'pcm16'> => ({
    pcm: new Int16Array(samples),
    tsMs: 0,
    sampleRate,
    channels,
  });

  it('starts empty', () => {
    const buffer = new PreconnectBuffer(100);
    expect(buffer.length).toBe(0);
    expect(buffer.durationMs).toBe(0);
  });

  it('accumulates frames under max duration', () => {
    const buffer = new PreconnectBuffer(100);
    buffer.push(createFrame(160)); // 10ms
    buffer.push(createFrame(160)); // 10ms
    expect(buffer.length).toBe(2);
    expect(buffer.durationMs).toBeCloseTo(20, 1);
  });

  it('trims oldest frames when exceeding max duration', () => {
    const buffer = new PreconnectBuffer(50);
    buffer.push(createFrame(160)); // 10ms
    buffer.push(createFrame(320)); // 20ms
    buffer.push(createFrame(480)); // 30ms
    expect(buffer.length).toBeLessThanOrEqual(2);
    expect(buffer.durationMs).toBeLessThanOrEqual(50);
  });

  it('keeps at least one frame even if exceeding max', () => {
    const buffer = new PreconnectBuffer(10);
    buffer.push(createFrame(640)); // 40ms
    expect(buffer.length).toBe(1);
  });

  it('drains all frames and clears', () => {
    const buffer = new PreconnectBuffer(100);
    buffer.push(createFrame(160));
    buffer.push(createFrame(160));
    const frames = buffer.drain();
    expect(frames.length).toBe(2);
    expect(buffer.length).toBe(0);
    expect(buffer.durationMs).toBe(0);
  });

  it('returns copy of frames on drain', () => {
    const buffer = new PreconnectBuffer(100);
    const frame = createFrame(160);
    buffer.push(frame);
    const drained1 = buffer.drain();
    buffer.push(frame);
    const drained2 = buffer.drain();
    expect(drained1).not.toBe(drained2);
  });

  it('clear resets buffer and duration', () => {
    const buffer = new PreconnectBuffer(100);
    buffer.push(createFrame(160));
    buffer.push(createFrame(160));
    buffer.clear();
    expect(buffer.length).toBe(0);
    expect(buffer.durationMs).toBe(0);
  });

  it('handles stereo frames', () => {
    const buffer = new PreconnectBuffer(100);
    buffer.push(createFrame(320, 16000, 2)); // 10ms stereo
    expect(buffer.durationMs).toBeCloseTo(10, 1);
  });

  it('handles different sample rates', () => {
    const buffer = new PreconnectBuffer(100);
    buffer.push(createFrame(441, 44100, 1)); // ~10ms
    expect(buffer.durationMs).toBeCloseTo(10, 1);
  });

  it('trims correctly with mixed frame sizes', () => {
    const buffer = new PreconnectBuffer(40);
    buffer.push(createFrame(160)); // 10ms
    buffer.push(createFrame(320)); // 20ms
    buffer.push(createFrame(160)); // 10ms
    buffer.push(createFrame(320)); // 20ms
    expect(buffer.durationMs).toBeLessThanOrEqual(40);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
