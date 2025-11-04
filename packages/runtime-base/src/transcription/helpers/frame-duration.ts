import type { NormalizedFrame } from '@saraudio/core';
import { frameDurationMs as calcDurationMs } from '@saraudio/utils';

export function frameDurationMs(frame: NormalizedFrame<'pcm16'>): number {
  return calcDurationMs(frame.pcm.length, frame.sampleRate, frame.channels);
}
