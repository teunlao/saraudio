import { describe, expect, it } from 'vitest';
import { resampleLinear } from './resample';

describe('resampleLinear', () => {
  it('returns empty when rates invalid or input empty', () => {
    expect(resampleLinear(new Float32Array(0), 48000, 16000).length).toBe(0);
    expect(resampleLinear(Float32Array.from([1, 2]), 0, 16000).length).toBe(0);
  });

  it('copies input when rates equal', () => {
    const src = Float32Array.from([0, 0.5, -0.5]);
    const out = resampleLinear(src, 48000, 48000);
    expect(Array.from(out)).toEqual(Array.from(src));
    expect(out).not.toBe(src);
  });

  it('downsamples 48k → 16k preserving duration', () => {
    const srcLen = 480; // 10ms at 48k
    const src = new Float32Array(srcLen);
    for (let i = 0; i < srcLen; i += 1) {
      src[i] = Math.sin((i / srcLen) * Math.PI * 2);
    }
    const out = resampleLinear(src, 48000, 16000);
    expect(out.length).toBe(Math.floor(srcLen * (16000 / 48000)) || 1);
    for (const value of out) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('upsamples 16k → 48k preserving duration', () => {
    const srcLen = 160;
    const src = new Float32Array(srcLen);
    for (let i = 0; i < srcLen; i += 1) {
      src[i] = i / srcLen;
    }
    const out = resampleLinear(src, 16000, 48000);
    expect(out.length).toBe(Math.floor(srcLen * (48000 / 16000)) || 1);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[out.length - 1]).toBeGreaterThan(0.98);
  });

  it('handles NaN in input without propagating', () => {
    const src = Float32Array.from([1, NaN, 3]);
    const out = resampleLinear(src, 48000, 16000);

    expect(out.length).toBeGreaterThan(0);
    for (const value of out) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('handles Infinity in input without propagating', () => {
    const src = Float32Array.from([1, Number.POSITIVE_INFINITY, 3, Number.NEGATIVE_INFINITY, 5]);
    const out = resampleLinear(src, 48000, 16000);

    expect(out.length).toBeGreaterThan(0);
    for (const value of out) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('handles very short input (single sample)', () => {
    const src = Float32Array.from([0.5]);
    const out = resampleLinear(src, 48000, 16000);

    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toBeCloseTo(0.5, 6);
  });

  it('handles very short input (two samples downsampling)', () => {
    const src = Float32Array.from([0.0, 1.0]);
    const out = resampleLinear(src, 48000, 16000); // 3:1 downsampling

    // 2 samples * (16k/48k) = 0.66 → rounds to 1 sample
    expect(out.length).toBe(1);
    // Interpolates between first two samples at t=0
    expect(out[0]).toBeCloseTo(0.0, 6);
  });

  it('handles very short input (two samples upsampling)', () => {
    const src = Float32Array.from([0.0, 1.0]);
    const out = resampleLinear(src, 16000, 48000); // 1:3 upsampling

    // 2 samples * (48k/16k) = 6 samples
    expect(out.length).toBe(6);
    expect(out[0]).toBeCloseTo(0.0, 6);
    expect(out[out.length - 1]).toBeCloseTo(1.0, 1);
  });

  it('preserves linear ramp shape after downsampling', () => {
    // Linear 0→1 ramp
    const src = new Float32Array(480); // 10ms @ 48kHz
    for (let i = 0; i < src.length; i += 1) {
      src[i] = i / (src.length - 1);
    }

    const out = resampleLinear(src, 48000, 16000);

    // Should still be roughly linear
    expect(out[0]).toBeCloseTo(0, 2);
    expect(out[out.length - 1]).toBeCloseTo(1, 2);

    // Check monotonicity (no reversals in increasing ramp)
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 0.01); // Small tolerance for floating point
    }
  });

  it('preserves linear ramp shape after upsampling', () => {
    // Linear 0→1 ramp
    const src = new Float32Array(160); // 10ms @ 16kHz
    for (let i = 0; i < src.length; i += 1) {
      src[i] = i / (src.length - 1);
    }

    const out = resampleLinear(src, 16000, 48000);

    // Should still be roughly linear
    expect(out[0]).toBeCloseTo(0, 2);
    expect(out[out.length - 1]).toBeCloseTo(1, 2);

    // Check monotonicity
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 0.01);
    }
  });

  it('handles extreme downsampling ratio (10:1)', () => {
    const src = new Float32Array(4800); // 100ms @ 48kHz
    src.fill(0.5);

    const out = resampleLinear(src, 48000, 4800);

    const expectedLen = Math.floor(4800 * (4800 / 48000));
    expect(out.length).toBe(expectedLen);

    // All values should be close to 0.5 (constant signal)
    for (const value of out) {
      expect(value).toBeCloseTo(0.5, 2);
    }
  });

  it('handles extreme upsampling ratio (10:1)', () => {
    const src = new Float32Array(16); // Small input
    for (let i = 0; i < src.length; i += 1) {
      src[i] = i / (src.length - 1);
    }

    const out = resampleLinear(src, 1000, 10000);

    const expectedLen = Math.floor(16 * (10000 / 1000));
    expect(out.length).toBe(expectedLen);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[out.length - 1]).toBeGreaterThan(0.95);
  });

  it('handles constant signal without distortion', () => {
    const src = new Float32Array(480);
    const value = 0.75;
    src.fill(value);

    const out = resampleLinear(src, 48000, 16000);

    // All resampled values should be exactly the constant (linear interpolation of constant = constant)
    for (const v of out) {
      expect(v).toBeCloseTo(value, 6);
    }
  });

  it('handles negative values correctly', () => {
    const src = Float32Array.from([-1.0, -0.5, 0.0, 0.5, 1.0]);
    const out = resampleLinear(src, 5000, 3000);

    expect(out.length).toBeGreaterThan(0);
    // Should have some negative values
    expect(out.some((v) => v < 0)).toBe(true);
    // Should have some positive values
    expect(out.some((v) => v > 0)).toBe(true);
    // All values should be finite
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
