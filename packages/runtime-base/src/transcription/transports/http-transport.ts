import type { BatchTranscriptionProvider, TranscriptResult } from '@saraudio/core';
import { encodeWavPcm16 } from '@saraudio/core';
import type { HttpLiveAggregator, Logger } from '@saraudio/utils';
import { createHttpLiveAggregator } from '@saraudio/utils';
import type { PreconnectBuffer } from '../helpers/preconnect-buffer';

export interface HttpTransportOptions {
  provider: BatchTranscriptionProvider;
  logger?: Logger;
  preconnectBuffer: PreconnectBuffer;
  onTranscript: (result: TranscriptResult) => void;
  onError: (error: Error) => void;
  chunking?: {
    intervalMs?: number;
    minDurationMs?: number;
    overlapMs?: number;
    maxInFlight?: number;
    timeoutMs?: number;
  };
}

export interface HttpTransport {
  aggregator: HttpLiveAggregator<TranscriptResult>;
}

export function createHttpTransport(opts: HttpTransportOptions): HttpTransport {
  const { provider, logger, preconnectBuffer, onTranscript, onError, chunking } = opts;

  const aggregator = createHttpLiveAggregator<TranscriptResult>({
    intervalMs: chunking?.intervalMs,
    minDurationMs: chunking?.minDurationMs,
    overlapMs: chunking?.overlapMs,
    maxInFlight: chunking?.maxInFlight,
    timeoutMs: chunking?.timeoutMs,
    onFlush: async ({ pcm, sampleRate, channels, signal: flushSignal }) => {
      const wav = encodeWavPcm16(pcm, { sampleRate, channels });
      return await provider.transcribe(wav, undefined, flushSignal);
    },
    onResult: (res) => {
      onTranscript(res);
    },
    onError: (err) => {
      onError((err as Error) ?? new Error('HTTP chunk flush failed'));
    },
    logger,
  });

  const frames = preconnectBuffer.drain();
  for (const frame of frames) {
    aggregator.push({ pcm: frame.pcm, sampleRate: frame.sampleRate, channels: frame.channels });
  }

  logger?.debug('connected', {
    module: 'runtime-base',
    event: 'connect',
    providerId: provider.id,
    transport: 'http',
  });

  return { aggregator };
}
