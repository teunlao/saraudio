import { describe, expect, it } from 'vitest';
import { drainFrames } from './sab-drain';

const makeRing = (capacity: number) => {
  const stateSAB = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const dataSAB = new SharedArrayBuffer(Int16Array.BYTES_PER_ELEMENT * capacity);
  const state = new Int32Array(stateSAB);
  const data = new Int16Array(dataSAB);
  return { state, data } as const;
};

describe('sab-drain', () => {
  it('drains exact multiple of frameSize (no wrap)', () => {
    const cap = 32;
    const frame = 8;
    const ring = makeRing(cap);
    // fill 0..31
    for (let i = 0; i < cap; i += 1) ring.data[i] = i;
    // write=24, read=0 => available=24 -> three frames of 8
    Atomics.store(ring.state, 0, 24);
    Atomics.store(ring.state, 1, 0);

    const res = drainFrames(ring, frame);
    expect(res.frames.length).toBe(3);
    expect(Array.from(res.frames[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(Array.from(res.frames[1])).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(Array.from(res.frames[2])).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
    expect(res.newReadIdx).toBe(24);
    expect(Atomics.load(ring.state, 1)).toBe(24);
  });

  it('drains across wrap-around', () => {
    const cap = 32;
    const frame = 8;
    const ring = makeRing(cap);
    for (let i = 0; i < cap; i += 1) ring.data[i] = i;
    // read=28, write=4 => available=(4-28+32)%32=8 -> one frame: [28..31,0..3]
    Atomics.store(ring.state, 1, 28);
    Atomics.store(ring.state, 0, 4);

    const res = drainFrames(ring, frame);
    expect(res.frames.length).toBe(1);
    expect(Array.from(res.frames[0])).toEqual([28, 29, 30, 31, 0, 1, 2, 3]);
    expect(res.newReadIdx).toBe(4);
  });

  it('does not drain when available < frameSize', () => {
    const cap = 32;
    const frame = 8;
    const ring = makeRing(cap);
    Atomics.store(ring.state, 1, 10);
    Atomics.store(ring.state, 0, 15); // available=5
    const res = drainFrames(ring, frame);
    expect(res.frames.length).toBe(0);
    expect(res.newReadIdx).toBe(10);
  });
});
