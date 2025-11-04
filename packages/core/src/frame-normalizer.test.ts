import { describe, expect, it } from 'vitest';
import { normalizeFrame } from './frame-normalizer';
import type { Frame } from './types';

const makeMonoFrame = (length = 8, sampleRate = 16000): Frame => {
  const pcm = new Int16Array(length);
  for (let i = 0; i < pcm.length; i += 1) pcm[i] = (i % 2 === 0 ? i : -i) * 100;
  return { pcm, tsMs: 0, sampleRate, channels: 1 };
};

const makeStereoFrame = (lengthPerCh = 4, sampleRate = 16000): Frame => {
  const total = lengthPerCh * 2;
  const pcm = new Float32Array(total);
  // interleaved L, R
  for (let i = 0; i < lengthPerCh; i += 1) {
    pcm[i * 2] = i / lengthPerCh; // L
    pcm[i * 2 + 1] = -(i / lengthPerCh); // R
  }
  return { pcm, tsMs: 0, sampleRate, channels: 2 };
};

describe('normalizeFrame channels handling', () => {
  it('does not upmix mono to stereo when channels: 2 requested', () => {
    const frame = makeMonoFrame(8, 16000);
    const out = normalizeFrame(frame, { format: { sampleRate: 16000, encoding: 'pcm16', channels: 2 } });
    expect(out.channels).toBe(1);
    expect(out.sampleRate).toBe(16000);
    expect(out.pcm instanceof Int16Array).toBe(true);
  });

  it('keeps stereo when channels: 2 requested and input is stereo', () => {
    const frame = makeStereoFrame(4, 16000);
    const out = normalizeFrame(frame, { format: { sampleRate: 16000, encoding: 'pcm16', channels: 2 } });
    expect(out.channels).toBe(2);
    expect(out.sampleRate).toBe(16000);
    expect(out.pcm instanceof Int16Array).toBe(true);
    expect((out.pcm as Int16Array).length).toBe((frame.pcm as Float32Array).length);
  });
});
