import { describe, expect, it } from 'vitest';
import { downmixToMono } from './downmix';

describe('downmixToMono', () => {
  it('returns empty array for no channels', () => {
    const out = downmixToMono([]);
    expect(out.length).toBe(0);
  });

  it('passes through mono (copy)', () => {
    const ch0 = Float32Array.from([0.1, -0.2, 0.3]);
    const out = downmixToMono([ch0]);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo(0.1, 6);
    expect(out[1]).toBeCloseTo(-0.2, 6);
    expect(out[2]).toBeCloseTo(0.3, 6);
    expect(out).not.toBe(ch0);
  });

  it('averages stereo L/R', () => {
    const left = Float32Array.from([1, 0, -1]);
    const right = Float32Array.from([0, 1, -1]);
    const out = downmixToMono([left, right]);
    expect(Array.from(out)).toEqual([0.5, 0.5, -1]);
  });

  it('averages N>2 channels', () => {
    const c0 = Float32Array.from([0.3, 0.3, 0.3]);
    const c1 = Float32Array.from([0.6, 0.0, -0.6]);
    const c2 = Float32Array.from([0.3, -0.3, 0.3]);
    const out = downmixToMono([c0, c1, c2]);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo(0.4, 6);
    expect(out[1]).toBeCloseTo(0, 6);
    expect(out[2]).toBeCloseTo(0, 6);
  });
});
