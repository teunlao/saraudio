import { describe, expect, it } from 'vitest';
import { FloatRingBuffer } from './float-ring-buffer';

describe('FloatRingBuffer', () => {
  describe('constructor', () => {
    it('creates buffer with valid capacity', () => {
      const buf = new FloatRingBuffer(1024);
      expect(buf.capacity).toBe(1024);
      expect(buf.size()).toBe(0);
      expect(buf.space()).toBe(1024);
      expect(buf.isEmpty()).toBe(true);
      expect(buf.isFull()).toBe(false);
    });

    it('throws on invalid capacity', () => {
      expect(() => new FloatRingBuffer(0)).toThrow('capacity must be a positive integer');
      expect(() => new FloatRingBuffer(-1)).toThrow('capacity must be a positive integer');
      expect(() => new FloatRingBuffer(1.5)).toThrow('capacity must be a positive integer');
    });
  });

  describe('write', () => {
    it('writes data to empty buffer', () => {
      const buf = new FloatRingBuffer(10);
      const data = new Float32Array([1, 2, 3, 4, 5]);

      const written = buf.write(data);

      expect(written).toBe(5);
      expect(buf.size()).toBe(5);
      expect(buf.space()).toBe(5);
    });

    it('writes nothing when buffer is full', () => {
      const buf = new FloatRingBuffer(5);
      buf.write(new Float32Array([1, 2, 3, 4, 5]));

      const written = buf.write(new Float32Array([6, 7, 8]));

      expect(written).toBe(0);
      expect(buf.size()).toBe(5);
      expect(buf.isFull()).toBe(true);
    });

    it('writes partial data when buffer almost full', () => {
      const buf = new FloatRingBuffer(10);
      buf.write(new Float32Array([1, 2, 3, 4, 5, 6, 7])); // 7 samples

      const written = buf.write(new Float32Array([8, 9, 10, 11, 12])); // try to write 5

      expect(written).toBe(3); // only 3 fit
      expect(buf.size()).toBe(10);
      expect(buf.isFull()).toBe(true);
    });

    it('handles wrap-around correctly', () => {
      const buf = new FloatRingBuffer(10);
      // Fill buffer
      buf.write(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      // Read some to create space at the beginning
      const temp = new Float32Array(6);
      buf.read(temp);
      // Now writeIndex is at 10 (wraps to 0), readIndex is at 6
      // Write data that will wrap around
      const data = new Float32Array([11, 12, 13, 14, 15, 16]);
      const written = buf.write(data);

      expect(written).toBe(6);
      expect(buf.size()).toBe(10);
      expect(buf.isFull()).toBe(true);
    });
  });

  describe('read', () => {
    it('reads data from buffer', () => {
      const buf = new FloatRingBuffer(10);
      buf.write(new Float32Array([1, 2, 3, 4, 5]));

      const dest = new Float32Array(3);
      const read = buf.read(dest);

      expect(read).toBe(3);
      expect(dest).toEqual(new Float32Array([1, 2, 3]));
      expect(buf.size()).toBe(2);
    });

    it('reads nothing from empty buffer', () => {
      const buf = new FloatRingBuffer(10);
      const dest = new Float32Array(5);

      const read = buf.read(dest);

      expect(read).toBe(0);
      expect(dest).toEqual(new Float32Array([0, 0, 0, 0, 0]));
    });

    it('reads partial data when buffer has less than requested', () => {
      const buf = new FloatRingBuffer(10);
      buf.write(new Float32Array([1, 2, 3]));

      const dest = new Float32Array(10);
      const read = buf.read(dest);

      expect(read).toBe(3);
      expect(dest.subarray(0, 3)).toEqual(new Float32Array([1, 2, 3]));
      expect(buf.isEmpty()).toBe(true);
    });

    it('handles wrap-around correctly', () => {
      const buf = new FloatRingBuffer(10);
      // Fill buffer
      buf.write(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      // Read some
      const temp1 = new Float32Array(6);
      buf.read(temp1);
      expect(temp1).toEqual(new Float32Array([1, 2, 3, 4, 5, 6]));

      // Write more (will wrap)
      buf.write(new Float32Array([11, 12, 13, 14, 15, 16]));

      // Read across wrap boundary
      const temp2 = new Float32Array(8);
      const read = buf.read(temp2);

      expect(read).toBe(8);
      expect(temp2).toEqual(new Float32Array([7, 8, 9, 10, 11, 12, 13, 14]));
    });
  });

  describe('toArray', () => {
    it('returns empty array for empty buffer', () => {
      const buf = new FloatRingBuffer(10);
      const arr = buf.toArray();

      expect(arr.length).toBe(0);
    });

    it('returns all data without consuming it', () => {
      const buf = new FloatRingBuffer(10);
      buf.write(new Float32Array([1, 2, 3, 4, 5]));

      const arr = buf.toArray();

      expect(arr).toEqual(new Float32Array([1, 2, 3, 4, 5]));
      expect(buf.size()).toBe(5); // Still has 5 samples
    });

    it('handles wrap-around correctly', () => {
      const buf = new FloatRingBuffer(10);
      // Fill buffer
      buf.write(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      // Read some
      const temp = new Float32Array(6);
      buf.read(temp);
      // Write more (wraps)
      buf.write(new Float32Array([11, 12, 13, 14, 15, 16]));

      const arr = buf.toArray();

      expect(arr).toEqual(new Float32Array([7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
      expect(buf.size()).toBe(10); // Data still in buffer
    });
  });

  describe('clear', () => {
    it('resets buffer to empty state', () => {
      const buf = new FloatRingBuffer(10);
      buf.write(new Float32Array([1, 2, 3, 4, 5]));

      buf.clear();

      expect(buf.size()).toBe(0);
      expect(buf.space()).toBe(10);
      expect(buf.isEmpty()).toBe(true);
      expect(buf.isFull()).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    it('handles variable-size chunks to fixed-size output', () => {
      const buf = new FloatRingBuffer(1000);
      const output: number[] = [];

      // Simulate irregular input chunks
      buf.write(new Float32Array([1, 2, 3])); // 3 samples
      buf.write(new Float32Array([4, 5, 6, 7, 8, 9, 10])); // 7 samples
      buf.write(new Float32Array([11, 12])); // 2 samples

      // Read fixed-size chunks of 5
      const chunk = new Float32Array(5);
      while (buf.size() >= 5) {
        buf.read(chunk);
        output.push(...chunk);
      }

      expect(output).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(buf.size()).toBe(2); // [11, 12] remain
    });

    it('handles pre-roll buffering scenario', () => {
      const buf = new FloatRingBuffer(800); // 50ms @ 16kHz
      const threshold = 320; // 20ms @ 16kHz
      let readyToSend = false;

      // Fill pre-roll buffer
      buf.write(new Float32Array(160)); // 10ms
      expect(buf.size()).toBeLessThan(threshold);

      buf.write(new Float32Array(160)); // 10ms
      expect(buf.size()).toBe(320);
      readyToSend = buf.size() >= threshold;

      expect(readyToSend).toBe(true);

      // Now can start sending
      const chunk = new Float32Array(320);
      const read = buf.read(chunk);
      expect(read).toBe(320);
    });

    it('handles continuous read/write cycling', () => {
      const buf = new FloatRingBuffer(100);
      let totalWritten = 0;
      let totalRead = 0;

      // Simulate 1000 iterations of write/read
      for (let i = 0; i < 1000; i += 1) {
        const writeSize = Math.floor(Math.random() * 20) + 1;
        const data = new Float32Array(writeSize).map((_, idx) => totalWritten + idx);
        const written = buf.write(data);
        totalWritten += written;

        if (buf.size() >= 10) {
          const dest = new Float32Array(10);
          const read = buf.read(dest);
          totalRead += read;
        }
      }

      // Drain remaining
      while (buf.size() > 0) {
        const dest = new Float32Array(buf.size());
        totalRead += buf.read(dest);
      }

      expect(totalRead).toBe(totalWritten);
      expect(buf.isEmpty()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty write', () => {
      const buf = new FloatRingBuffer(10);
      const written = buf.write(new Float32Array(0));

      expect(written).toBe(0);
      expect(buf.isEmpty()).toBe(true);
    });

    it('handles empty read', () => {
      const buf = new FloatRingBuffer(10);
      buf.write(new Float32Array([1, 2, 3]));

      const dest = new Float32Array(0);
      const read = buf.read(dest);

      expect(read).toBe(0);
      expect(buf.size()).toBe(3);
    });

    it('handles exact capacity write', () => {
      const buf = new FloatRingBuffer(5);
      const data = new Float32Array([1, 2, 3, 4, 5]);
      const written = buf.write(data);

      expect(written).toBe(5);
      expect(buf.isFull()).toBe(true);
    });

    it('handles exact capacity read', () => {
      const buf = new FloatRingBuffer(5);
      buf.write(new Float32Array([1, 2, 3, 4, 5]));

      const dest = new Float32Array(5);
      const read = buf.read(dest);

      expect(read).toBe(5);
      expect(dest).toEqual(new Float32Array([1, 2, 3, 4, 5]));
      expect(buf.isEmpty()).toBe(true);
    });

    it('preserves data correctness through multiple wrap cycles', () => {
      const buf = new FloatRingBuffer(10);
      let counter = 0;

      // Write and read 100 samples total through a 10-sample buffer
      for (let cycle = 0; cycle < 10; cycle += 1) {
        const data = new Float32Array(10).map(() => counter++);
        buf.write(data);

        const dest = new Float32Array(10);
        buf.read(dest);

        // Verify data correctness
        for (let i = 0; i < 10; i += 1) {
          expect(dest[i]).toBe(cycle * 10 + i);
        }
      }
    });
  });
});
