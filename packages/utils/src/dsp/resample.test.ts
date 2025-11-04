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
});
