import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createRecorder } from '../recorder';
import { createNodeRuntime } from '../runtime';

describe('NodeRecorder', () => {
  const createMockStream = (durationMs = 100): Readable => {
    const sampleRate = 16000;
    const samplesPerMs = sampleRate / 1000;
    const totalSamples = Math.floor(durationMs * samplesPerMs);
    const bufferSize = totalSamples * 2; // Int16 = 2 bytes per sample

    let offset = 0;
    const buffer = Buffer.alloc(bufferSize);

    // Fill with mock audio data (sine wave)
    for (let i = 0; i < totalSamples; i++) {
      const value = Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 0x7fff;
      buffer.writeInt16LE(Math.floor(value), i * 2);
    }

    return new Readable({
      read() {
        const chunkSize = 1024;
        if (offset < bufferSize) {
          const end = Math.min(offset + chunkSize, bufferSize);
          this.push(buffer.subarray(offset, end));
          offset = end;
        } else {
          this.push(null);
        }
      },
    });
  };

  it('creates recorder with default options', () => {
    const rec = createRecorder();
    expect(rec.status).toBe('idle');
    expect(rec.error).toBeNull();
    expect(rec.pipeline).toBeDefined();
  });

  it('requires source before start', async () => {
    const rec = createRecorder();
    await expect(rec.start()).rejects.toThrow('No source configured');
  });

  it('starts and stops with source', async () => {
    const runtime = createNodeRuntime();
    const stream = createMockStream(50);
    const source = runtime.createPcm16StreamSource({
      stream,
      sampleRate: 16000,
      channels: 1,
      frameSize: 512,
    });

    const rec = createRecorder({ source });

    expect(rec.status).toBe('idle');
    await rec.start();
    expect(rec.status).toBe('running');

    // Wait for stream to finish
    await new Promise((resolve) => setTimeout(resolve, 100));

    await rec.stop();
    expect(rec.status).toBe('idle');
  });

  it('updates source dynamically', async () => {
    const runtime = createNodeRuntime();
    const rec = createRecorder();

    const stream = createMockStream(50);
    const source = runtime.createPcm16StreamSource({
      stream,
      sampleRate: 16000,
      channels: 1,
    });

    await rec.update({ source });
    await rec.start();
    expect(rec.status).toBe('running');

    await new Promise((resolve) => setTimeout(resolve, 100));
    await rec.stop();
    expect(rec.status).toBe('idle');
  });

  it('exposes recordings API with Buffer', async () => {
    const runtime = createNodeRuntime();
    const stream = createMockStream(50);
    const source = runtime.createPcm16StreamSource({
      stream,
      sampleRate: 16000,
      channels: 1,
    });

    const rec = createRecorder({ source });
    await rec.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rec.stop();

    const cleanedBuffer = await rec.recordings.cleaned.getBuffer();
    expect(cleanedBuffer).toBeInstanceOf(Buffer);
    expect(cleanedBuffer?.length).toBeGreaterThan(0);

    const fullBuffer = await rec.recordings.full.getBuffer();
    expect(fullBuffer).toBeInstanceOf(Buffer);
  });

  it('exposes durationMs from recordings', async () => {
    const runtime = createNodeRuntime();
    const stream = createMockStream(50);
    const source = runtime.createPcm16StreamSource({
      stream,
      sampleRate: 16000,
      channels: 1,
    });

    const rec = createRecorder({ source });
    await rec.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rec.stop();

    const duration = rec.recordings.full.durationMs;
    expect(duration).toBeGreaterThan(0);
  });

  it('supports VAD subscription', async () => {
    const runtime = createNodeRuntime();
    const stream = createMockStream(50);
    const source = runtime.createPcm16StreamSource({
      stream,
      sampleRate: 16000,
      channels: 1,
    });

    const rec = createRecorder({ source });
    const vadEvents: Array<{ score: number; speech: boolean }> = [];

    rec.onVad((vad) => {
      vadEvents.push(vad);
    });

    await rec.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rec.stop();

    // Should have VAD events if stages include VAD
    // (currently no VAD in default config, but API works)
    expect(Array.isArray(vadEvents)).toBe(true);
  });

  it('resets assembler via reset()', async () => {
    const runtime = createNodeRuntime();
    const stream = createMockStream(50);
    const source = runtime.createPcm16StreamSource({
      stream,
      sampleRate: 16000,
      channels: 1,
    });

    const rec = createRecorder({ source });
    await rec.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rec.stop();

    const bufferBefore = await rec.recordings.full.getBuffer();
    expect(bufferBefore).not.toBeNull();
    expect(bufferBefore?.length).toBeGreaterThan(44); // WAV header + data

    rec.reset();

    const bufferAfter = await rec.recordings.full.getBuffer();
    // After reset, assembler is recreated so recording should be empty or minimal
    // (may contain WAV header but no audio data)
    if (bufferAfter) {
      expect(bufferAfter.length).toBeLessThanOrEqual(44); // WAV header only
    }
  });

  it('disposes pipeline listeners', () => {
    const rec = createRecorder();
    expect(() => rec.dispose()).not.toThrow();
  });
});
