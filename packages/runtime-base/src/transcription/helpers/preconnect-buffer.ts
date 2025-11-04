import type { NormalizedFrame } from '@saraudio/core';
import { frameDurationMs } from './frame-duration';

export class PreconnectBuffer {
  private buffer: Array<NormalizedFrame<'pcm16'>> = [];
  private bufferedMs = 0;

  constructor(private readonly maxDurationMs: number) {}

  push(frame: NormalizedFrame<'pcm16'>): void {
    this.buffer.push(frame);
    this.bufferedMs += frameDurationMs(frame);
    while (this.bufferedMs > this.maxDurationMs && this.buffer.length > 1) {
      const dropped = this.buffer.shift();
      if (dropped) this.bufferedMs -= frameDurationMs(dropped);
    }
  }

  drain(): Array<NormalizedFrame<'pcm16'>> {
    const frames = [...this.buffer];
    this.clear();
    return frames;
  }

  clear(): void {
    this.buffer.length = 0;
    this.bufferedMs = 0;
  }

  get durationMs(): number {
    return this.bufferedMs;
  }

  get length(): number {
    return this.buffer.length;
  }
}
