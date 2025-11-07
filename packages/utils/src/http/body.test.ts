import { describe, expect, test } from 'vitest';
import { sliceBuffer, toArrayBuffer } from './body';

describe('http/body', () => {
  test('toArrayBuffer with ArrayBuffer returns same', async () => {
    const buf = new ArrayBuffer(8);
    const out = await toArrayBuffer(buf);
    expect(out.byteLength).toBe(8);
    expect(out).toBe(buf);
  });

  test('toArrayBuffer with Uint8Array copies when sliced', async () => {
    const src = new Uint8Array(10);
    const view = src.subarray(2, 8);
    const out = await toArrayBuffer(view);
    expect(out.byteLength).toBe(6);
  });

  test('sliceBuffer returns underlying buffer when whole', () => {
    const src = new Uint8Array(4);
    const out = sliceBuffer(src);
    expect(out).toBe(src.buffer);
  });

  test('sliceBuffer returns copy when view is partial', () => {
    const src = new Uint8Array(10);
    const view = src.subarray(2, 7);
    const out = sliceBuffer(view);
    expect(out.byteLength).toBe(5);
    expect(out).not.toBe(src.buffer);
  });

  test('toArrayBuffer with Blob', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' });
    const out = await toArrayBuffer(blob);
    expect(out.byteLength).toBe(3);
    const arr = new Uint8Array(out);
    expect(Array.from(arr)).toEqual([1, 2, 3]);
  });

  test('toArrayBuffer with Uint8Array whole view reuses buffer', async () => {
    const src = new Uint8Array([9, 8, 7]);
    const out = await toArrayBuffer(src);
    expect(out).toBe(src.buffer);
  });
});
