import type { Frame } from '@saraudio/core';

export interface NodeFrameSource {
  start(onFrame: (frame: Frame) => void): Promise<void>;
  stop(): Promise<void>;
}
