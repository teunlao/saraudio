import type { NodeFrameSource } from '../types';
import { createProxySource } from './internal/proxy-source';
import type { MicrophoneSourceOptions } from './types';

export function createMicrophoneSource(options: MicrophoneSourceOptions = {}): NodeFrameSource {
  return createProxySource('mic', options);
}
