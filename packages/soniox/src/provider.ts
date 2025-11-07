import { defineProvider } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { resolveConfig } from './config';
import { transcribeHTTP } from './transport-http';
import { createWsStream } from './transport-ws';
import type { SonioxOptions, SonioxProvider } from './types';

export function soniox(options: SonioxOptions): SonioxProvider {
  const logger: Logger | undefined = options.logger ? options.logger.child('provider-soniox') : undefined;
  let resolved = resolveConfig(options);
  const listeners = new Set<(opts: SonioxOptions) => void>();

  return defineProvider({
    id: 'soniox',
    capabilities: {
      partials: 'mutable',
      words: true,
      diarization: 'word',
      language: 'final',
      segments: false,
      forceEndpoint: true,
      multichannel: true,
      transports: { http: true, websocket: true },
    },
    getPreferredFormat() {
      return { encoding: 'pcm16', sampleRate: resolved.sampleRate, channels: resolved.channels } as const;
    },
    getSupportedFormats() {
      return [
        { encoding: 'pcm16', sampleRate: 16000, channels: 1 },
        { encoding: 'pcm16', sampleRate: 16000, channels: 2 },
        { encoding: 'pcm16', sampleRate: 8000, channels: 1 },
      ] as const;
    },
    negotiateFormat(candidate) {
      const sampleRate = candidate.sampleRate ?? resolved.sampleRate;
      const channels = (candidate.channels ?? resolved.channels) as 1 | 2;
      return { encoding: 'pcm16', sampleRate, channels } as const;
    },
    async update(next) {
      resolved = resolveConfig(next);
      listeners.forEach((l) => l(next));
    },
    onUpdate(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stream() {
      return createWsStream(resolved, logger);
    },
    async transcribe(audio, batchOptions, signal) {
      return transcribeHTTP(resolved, audio, batchOptions, signal, logger);
    },
  });
}
