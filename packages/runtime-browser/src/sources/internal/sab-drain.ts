// Pure helper to drain Int16 mono samples from a SAB ring buffer in fixed-size frames.
// Mirrors the logic used in worklet-source.ts event handler.

export interface SabRingViews {
  state: Int32Array; // [writeIdx, readIdx]
  data: Int16Array; // ring buffer storage
}

export interface DrainResult {
  frames: Int16Array[];
  newReadIdx: number;
}

export function drainFrames(views: SabRingViews, frameSize: number): DrainResult {
  const state = views.state;
  const data = views.data;
  const capacity = data.length;
  let r = Atomics.load(state, 1);
  const out: Int16Array[] = [];

  // Drain while enough samples for a full frame
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const wNow = Atomics.load(state, 0);
    const available = (wNow - r + capacity) % capacity;
    if (available < frameSize) break;

    const end = Math.min(r + frameSize, capacity);
    const firstLen = end - r;
    const frame = new Int16Array(frameSize);
    frame.set(data.subarray(r, end), 0);
    if (firstLen < frameSize) {
      const rest = frameSize - firstLen;
      frame.set(data.subarray(0, rest), firstLen);
      r = rest;
    } else {
      r = (r + frameSize) % capacity;
    }
    Atomics.store(state, 1, r);
    out.push(frame);
  }

  return { frames: out, newReadIdx: r };
}
