export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }
  const length = channels[0]?.length ?? 0;
  if (channels.length === 1) {
    const out = new Float32Array(length);
    out.set(channels[0] ?? new Float32Array(0));
    return out;
  }
  const out = new Float32Array(length);
  const count = channels.length;
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (let ch = 0; ch < count; ch += 1) {
      sum += channels[ch]?.[i] ?? 0;
    }
    out[i] = sum / count;
  }
  return out;
}
