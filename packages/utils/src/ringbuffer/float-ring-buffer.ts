/**
 * High-performance ring buffer for Float32Array data.
 * Optimized for real-time audio processing with zero-allocation bulk operations.
 *
 * Features:
 * - Fixed-size circular buffer (no dynamic allocations after construction)
 * - Bulk copy operations using TypedArray.set() (10-100x faster than element-by-element)
 * - Thread-safe for single producer/single consumer (SPSC) pattern
 * - Non-destructive read via toArray()
 *
 * Use cases:
 * - AudioWorklet buffering (smoothing async data → sync audio output)
 * - Variable-size chunking → fixed-size chunks
 * - Pre-roll buffers for transcription (avoid losing first frames)
 * - Resampling with remainder accumulation
 */
export class FloatRingBuffer {
  private readonly buffer: Float32Array;

  private writeIndex = 0;

  private readIndex = 0;

  private available = 0;

  constructor(readonly capacity: number) {
    if (capacity <= 0 || !Number.isInteger(capacity)) {
      throw new Error(`capacity must be a positive integer, got ${capacity}`);
    }
    this.buffer = new Float32Array(capacity);
  }

  /**
   * Reset buffer to empty state.
   * Does not zero out memory (for performance).
   */
  clear(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.available = 0;
  }

  /**
   * Write data to the buffer.
   * Uses bulk copy (TypedArray.set) when possible.
   *
   * @param data - Source data to write
   * @returns Number of samples actually written (≤ data.length if buffer full)
   */
  write(data: Float32Array): number {
    const space = this.capacity - this.available;
    const toWrite = Math.min(data.length, space);

    if (toWrite === 0) return 0;

    // How many samples fit before wrapping to buffer start
    const beforeWrap = Math.min(toWrite, this.capacity - this.writeIndex);

    // Bulk copy until end of buffer
    this.buffer.set(data.subarray(0, beforeWrap), this.writeIndex);

    // If data wraps around, copy remainder to start
    if (beforeWrap < toWrite) {
      this.buffer.set(data.subarray(beforeWrap, toWrite), 0);
    }

    this.writeIndex = (this.writeIndex + toWrite) % this.capacity;
    this.available += toWrite;
    return toWrite;
  }

  /**
   * Read data from the buffer into destination.
   * Uses bulk copy (TypedArray.set) when possible.
   *
   * @param dest - Destination array to read into
   * @returns Number of samples actually read (≤ dest.length if buffer empty)
   */
  read(dest: Float32Array): number {
    const toRead = Math.min(dest.length, this.available);

    if (toRead === 0) return 0;

    // How many samples before wrapping
    const beforeWrap = Math.min(toRead, this.capacity - this.readIndex);

    // Bulk copy from readIndex to end
    dest.set(this.buffer.subarray(this.readIndex, this.readIndex + beforeWrap));

    // If read wraps around, copy remainder from start
    if (beforeWrap < toRead) {
      dest.set(this.buffer.subarray(0, toRead - beforeWrap), beforeWrap);
    }

    this.readIndex = (this.readIndex + toRead) % this.capacity;
    this.available -= toRead;
    return toRead;
  }

  /**
   * Get current number of available samples.
   */
  size(): number {
    return this.available;
  }

  /**
   * Get remaining space in buffer.
   */
  space(): number {
    return this.capacity - this.available;
  }

  /**
   * Check if buffer is empty.
   */
  isEmpty(): boolean {
    return this.available === 0;
  }

  /**
   * Check if buffer is full.
   */
  isFull(): boolean {
    return this.available === this.capacity;
  }

  /**
   * Read all available data without consuming it.
   * Non-destructive peek operation.
   *
   * @returns Copy of all available data
   */
  toArray(): Float32Array {
    const result = new Float32Array(this.available);

    if (this.available === 0) return result;

    const beforeWrap = Math.min(this.available, this.capacity - this.readIndex);

    // Bulk copy from readIndex to end
    result.set(this.buffer.subarray(this.readIndex, this.readIndex + beforeWrap));

    // If data wraps around, copy remainder from start
    if (beforeWrap < this.available) {
      result.set(this.buffer.subarray(0, this.available - beforeWrap), beforeWrap);
    }

    return result;
  }
}
