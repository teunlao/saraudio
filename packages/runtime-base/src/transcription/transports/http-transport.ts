import type { TranscriptionProvider, TranscriptResult, TranscriptToken, TranscriptUpdate } from '@saraudio/core';
import { encodeWavPcm16 } from '@saraudio/core';
import type { HttpLiveAggregator, Logger } from '@saraudio/utils';
import { createHttpLiveAggregator } from '@saraudio/utils';
import type { PreconnectBuffer } from '../helpers/preconnect-buffer';

export interface HttpTransportOptions {
  provider: TranscriptionProvider;
  logger?: Logger;
  preconnectBuffer: PreconnectBuffer;
  onUpdate: (update: TranscriptUpdate) => void;
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
  const { provider, logger, preconnectBuffer, onUpdate, onError, chunking } = opts;
  const transcribe = provider.transcribe;
  if (typeof transcribe !== 'function') {
    throw new Error('Provider does not support HTTP transcription');
  }

  const resultToUpdate = (result: TranscriptResult): TranscriptUpdate => {
    const tokens: TranscriptToken[] = [];
    if (result.words && result.words.length > 0) {
      for (const word of result.words) {
        const token: TranscriptToken = { text: `${word.word} `, isFinal: true };
        token.startMs = word.startMs;
        token.endMs = word.endMs;
        if (typeof word.confidence === 'number') token.confidence = word.confidence;
        if (typeof word.speaker === 'number') token.speaker = word.speaker;
        tokens.push(token);
      }
    } else if (result.text) {
      tokens.push({ text: result.text, isFinal: true });
    }

    const update: TranscriptUpdate = { providerId: provider.id, tokens, finalize: true };
    if (result.language) update.language = result.language;
    if (result.span) update.span = result.span;
    if (result.turnId !== undefined) update.turnId = result.turnId;
    if (result.metadata) update.metadata = result.metadata;
    return update;
  };

  const aggregator = createHttpLiveAggregator<TranscriptResult>({
    intervalMs: chunking?.intervalMs,
    minDurationMs: chunking?.minDurationMs,
    overlapMs: chunking?.overlapMs,
    maxInFlight: chunking?.maxInFlight,
    timeoutMs: chunking?.timeoutMs,
    onFlush: async ({ pcm, sampleRate, channels, signal: flushSignal }) => {
      const wav = encodeWavPcm16(pcm, { sampleRate, channels });
      return await transcribe.call(provider, wav, undefined, flushSignal);
    },
    onResult: (res) => {
      onUpdate(resultToUpdate(res));
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
