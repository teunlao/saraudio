import { defineProvider } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';

import { normalizeChannels, resolveConfig } from './config';
import { type DeepgramModelId, SUPPORTED_FORMATS } from './models';
import { transcribeHTTP } from './transport-http';
import { createWsStream } from './transport-ws';
import type { DeepgramOptions, DeepgramProvider } from './types';

export function deepgram<M extends DeepgramModelId>(options: DeepgramOptions<M>): DeepgramProvider {
  const logger: Logger | undefined = options.logger ? options.logger.child('provider-deepgram') : undefined;
  let config = resolveConfig(options);
  const listeners = new Set<(opts: DeepgramOptions<M>) => void>();

  return defineProvider({
    id: 'deepgram',
    capabilities: {
      partials: 'mutable',
      words: true,
      diarization: 'word',
      language: 'final',
      segments: true,
      forceEndpoint: false,
      multichannel: true,
      translation: 'none',
      transports: { http: true, websocket: true },
    },
    get tokenProvider() {
      return config.raw.tokenProvider;
    },
    getPreferredFormat() {
      return { sampleRate: config.sampleRate, channels: config.channels, encoding: 'pcm16' } as const;
    },
    getSupportedFormats() {
      return SUPPORTED_FORMATS;
    },
    negotiateFormat(candidate) {
      const sampleRate = candidate.sampleRate ?? config.sampleRate;
      const channels = normalizeChannels(candidate.channels ?? config.channels);
      return { sampleRate, channels, encoding: 'pcm16' } as const;
    },
    async update(next: DeepgramOptions<M>) {
      config = resolveConfig(next);
      listeners.forEach((l) => l(next));
    },
    onUpdate(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // WebSocket live stream
    stream() {
      return createWsStream(config, logger);
    },
    // HTTP batch transcription
    async transcribe(audio, batchOptions, signal) {
      return await transcribeHTTP(config.raw, audio, batchOptions, signal, logger);
    },
  });
}
