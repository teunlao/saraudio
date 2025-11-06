import type { ProviderUpdateListener, RecorderFormatOptions, StreamOptions } from '@saraudio/core';
import { ProviderError } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import type { DeepgramModelId } from './models';
import { createHttpTransport } from './transport-http';
import type { TransportStrategy } from './transport-strategy';
import { createWsTransport } from './transport-ws';
import type { DeepgramOptions, DeepgramProvider } from './types';

export function deepgram<M extends DeepgramModelId>(options: DeepgramOptions<M>): DeepgramProvider {
  const updateListeners = new Set<ProviderUpdateListener<DeepgramOptions<DeepgramModelId>>>();
  let baseLogger: Logger | null = options.logger ?? null;
  let providerLogger = baseLogger ? baseLogger.child('provider-deepgram') : undefined;

  const transportChoice = options.transport ?? 'websocket';
  const getLogger = (): Logger | undefined => providerLogger;
  const transportStrategy: TransportStrategy =
    transportChoice === 'http' ? createHttpTransport(options, getLogger) : createWsTransport(options, getLogger);

  const provider: DeepgramProvider = {
    id: 'deepgram',
    get transport() {
      return transportStrategy.kind;
    },
    get capabilities() {
      return transportStrategy.capabilities;
    },
    get tokenProvider() {
      return transportStrategy.tokenProvider();
    },
    getPreferredFormat(): RecorderFormatOptions {
      return transportStrategy.getPreferredFormat();
    },
    getSupportedFormats(): ReadonlyArray<RecorderFormatOptions> {
      return transportStrategy.getSupportedFormats();
    },
    negotiateFormat(candidate: RecorderFormatOptions): RecorderFormatOptions {
      return transportStrategy.negotiateFormat(candidate);
    },
    async update(nextOptions) {
      const requestedTransport = nextOptions.transport ?? transportStrategy.kind;
      if (requestedTransport !== transportStrategy.kind) {
        throw new ProviderError(
          'Transport cannot be changed via update(); create a new provider with desired transport',
          'deepgram',
        );
      }
      if (hasOwn(nextOptions, 'logger')) {
        baseLogger = nextOptions.logger ?? null;
        providerLogger = baseLogger ? baseLogger.child('provider-deepgram') : undefined;
      }
      transportStrategy.update({ ...nextOptions, transport: transportStrategy.kind });
      updateListeners.forEach((listener) => listener(transportStrategy.rawOptions()));
    },
    onUpdate(listener) {
      updateListeners.add(listener);
      return () => {
        updateListeners.delete(listener);
      };
    },
    stream(options?: StreamOptions) {
      if (transportStrategy.kind !== 'websocket') {
        throw new ProviderError('Stream is only available for WebSocket transport', 'deepgram');
      }
      return transportStrategy.stream(options);
    },
    async transcribe(audio, batchOptions, signal) {
      if (transportStrategy.kind !== 'http') {
        throw new ProviderError('Transcribe is only available for HTTP transport', 'deepgram');
      }
      return transportStrategy.transcribe(audio, batchOptions, signal);
    },
  };

  return provider;
}

function hasOwn(object: DeepgramOptions<DeepgramModelId>, key: string): boolean {
  return Object.hasOwn(object, key);
}
