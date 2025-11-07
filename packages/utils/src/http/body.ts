/** Convert various binary inputs to a standalone ArrayBuffer. */
export async function toArrayBuffer(source: Blob | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  if (source instanceof Uint8Array) return sliceBuffer(source);
  if (source instanceof ArrayBuffer) return source;
  return await source.arrayBuffer();
}

/** Return a copy buffer when view is not whole-buffer, otherwise reuse underlying buffer. */
export function sliceBuffer(view: Uint8Array): ArrayBuffer {
  const buf = view.buffer;
  if (buf instanceof ArrayBuffer && view.byteOffset === 0 && view.byteLength === buf.byteLength) {
    return buf;
  }
  return view.slice().buffer;
}
