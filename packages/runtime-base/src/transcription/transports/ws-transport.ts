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
  for (const frame of frames) {
    stream.send(frame);
  }

  logger?.debug('connected', { module: 'runtime-base', event: 'connect', providerId });

  return stream;
}
