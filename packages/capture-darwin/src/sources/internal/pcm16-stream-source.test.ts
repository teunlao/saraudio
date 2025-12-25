import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createPcm16StreamSource } from './pcm16-stream-source';

const makePcm16Le = (samples: number[]): Buffer => {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    out.writeInt16LE(samples[i] ?? 0, i * 2);
  }
  return out;
};

describe('createPcm16StreamSource', () => {
  it('frames pcm16 stream into 10ms frames and appends trailing silence on end', async () => {
    const sampleRate = 16000;
    const frameSize = 160;
    const channels = 1 as const;

    const samples = Array.from({ length: frameSize * 2 }, (_, i) => i);
    const stream = Readable.from([makePcm16Le(samples)]);

    const frames: Array<{ tsMs: number; pcm: Int16Array }> = [];
    const source = createPcm16StreamSource({ stream, sampleRate, channels, frameSize });

    await source.start((frame) => {
      const { pcm } = frame;
      if (!(pcm instanceof Int16Array)) {
        throw new Error('Expected pcm to be Int16Array');
      }
      frames.push({ tsMs: frame.tsMs, pcm });
    });

    expect(frames.length).toBe(2 + 30);
    expect(frames[0]?.tsMs).toBe(0);
    expect(frames[1]?.tsMs).toBe(10);
    expect(frames[0]?.pcm[0]).toBe(0);
    expect(frames[0]?.pcm[frameSize - 1]).toBe(frameSize - 1);
    expect(frames[1]?.pcm[0]).toBe(frameSize);

    const trailing = frames.slice(2);
    expect(trailing.length).toBe(30);
    for (const frame of trailing) {
      expect(frame.pcm.every((v) => v === 0)).toBe(true);
    }
  });

  it('stop resolves without emitting trailing frames', async () => {
    const sampleRate = 16000;
    const frameSize = 160;
    const channels = 1 as const;

    const stream = new Readable({
      read() {},
    });

    const frames: number[] = [];
    const source = createPcm16StreamSource({ stream, sampleRate, channels, frameSize });

    let resolveFirst: (() => void) | null = null;
    const firstFrame = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const startPromise = source.start((frame) => {
      frames.push(frame.tsMs);
      resolveFirst?.();
      resolveFirst = null;
    });

    stream.push(makePcm16Le(Array.from({ length: frameSize }, (_, i) => i)));
    await firstFrame;

    await source.stop();
    await startPromise;

    expect(frames.length).toBe(1);
  });
});
