import type { TranscriptionStream } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import type { PreconnectBuffer } from '../helpers/preconnect-buffer';

export interface WsTransportOptions {
  logger?: Logger;
  stream: TranscriptionStream;
  preconnectBuffer: PreconnectBuffer;
  providerId: string;
}

export async function connectWsTransport(opts: WsTransportOptions, signal?: AbortSignal): Promise<TranscriptionStream> {
  const { logger, stream, preconnectBuffer, providerId } = opts;

  await stream.connect(signal);

  const frames = preconnectBuffer.drain();
  for (let i = 0; i < frames.length; i += 1) {
    stream.send(frames[i]);
  }

  logger?.debug('connected', { module: 'runtime-base', event: 'connect', providerId });

  return stream;
}
