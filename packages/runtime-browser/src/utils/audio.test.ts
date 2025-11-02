import type { Segment } from '@saraudio/core';
import { describe, expect, it, vi } from 'vitest';
import { int16InterleavedToAudioBuffer, segmentToAudioBuffer } from './audio';

// Minimal FakeAudioContext for testing buffer creation
class FakeAudioBuffer {
  private readonly channels: Float32Array[];
  constructor(
    public readonly numberOfChannels: number,
    public readonly length: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(ch: number): Float32Array {
    return this.channels[ch];
  }
}

class FakeAudioContext {
  public destination = {} as AudioDestinationNode;
  constructor(public readonly opts?: { sampleRate?: number }) {}
  createBuffer(channels: number, frames: number): AudioBuffer {
    return new FakeAudioBuffer(channels, frames) as unknown as AudioBuffer;
  }
  // Not used in these tests
  createBufferSource(): AudioBufferSourceNode {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as AudioBufferSourceNode;
  }
}

describe('utils/audio', () => {
  it('int16InterleavedToAudioBuffer deinterleaves stereo and normalizes to float32', () => {
    const ctx = new FakeAudioContext({ sampleRate: 16000 }) as unknown as AudioContext;
    // 3 stereo frames interleaved: L0,R0,L1,R1,L2,R2
    const pcm = new Int16Array([32767, -32768, 16384, -16384, 0, 0]);
    const buf = int16InterleavedToAudioBuffer(ctx, pcm, { sampleRate: 16000, channels: 2 });
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBe(3);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    expect(Array.from(L).map((v) => Math.round(v * 32768))).toEqual([32767, 16384, 0]);
    expect(Array.from(R).map((v) => Math.round(v * 32768))).toEqual([-32768, -16384, 0]);
  });

  it('segmentToAudioBuffer returns null when no PCM', () => {
    const ctx = new FakeAudioContext({ sampleRate: 16000 }) as unknown as AudioContext;
    const segment: Segment = {
      id: 'x',
      startMs: 0,
      endMs: 10,
      durationMs: 10,
      sampleRate: 16000,
      channels: 1,
    };
    expect(segmentToAudioBuffer(ctx, segment)).toBeNull();
  });
});
