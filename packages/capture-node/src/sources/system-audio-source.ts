import type { NodeFrameSource } from '../types';
import { createProxySource } from './internal/proxy-source';
import type { SystemAudioSourceOptions } from './types';

export function createSystemAudioSource(options: SystemAudioSourceOptions = {}): NodeFrameSource {
  return createProxySource('system', options);
}
