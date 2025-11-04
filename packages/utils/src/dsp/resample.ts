// Lightweight linear resampler for mono Float32 audio.
// Designed for short frames in real-time pipelines.
export function resampleLinear(input: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate <= 0 || dstRate <= 0 || input.length === 0) {
    return new Float32Array(0);
  }
  if (srcRate === dstRate) {
    const out = new Float32Array(input.length);
    out.set(input);
    return out;
  }
  const ratio = dstRate / srcRate;
  const outLen = Math.max(1, Math.floor(input.length * ratio));
  const output = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i / ratio;
    const idx = Math.floor(pos);
    const next = Math.min(idx + 1, input.length - 1);
    const t = pos - idx;
    const a = Number.isFinite(input[idx]) ? input[idx] : 0;
    const b = Number.isFinite(input[next]) ? input[next] : 0;
    output[i] = a + (b - a) * t;
  }
  return output;
}
