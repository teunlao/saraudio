import type { ProviderUpdateListener, RecorderFormatOptions, StreamOptions } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { createProtocolList, resolveAuthToken } from './auth';
import { CAPABILITIES } from './capabilities';
import { type DeepgramResolvedConfig, normalizeChannels, resolveConfig } from './config';
import { type DeepgramModelId, SUPPORTED_FORMATS } from './models';
import { createDeepgramStream, type DeepgramConnectionInfoFactory } from './stream';
import type { DeepgramOptions, DeepgramProvider } from './types';
import { buildUrl } from './url';

export function deepgram<M extends DeepgramModelId>(options: DeepgramOptions<M>): DeepgramProvider {
  let config: DeepgramResolvedConfig = resolveConfig(options);
  let baseLogger: Logger | null = options.logger ?? null;
  let providerLogger = baseLogger ? baseLogger.child('provider-deepgram') : undefined;
  const updateListeners = new Set<ProviderUpdateListener<DeepgramOptions<DeepgramModelId>>>();

  const connectionFactory: DeepgramConnectionInfoFactory = async () => {
    const params = new URLSearchParams(config.baseParams);
    const finalUrl = await buildUrl(config.baseUrl, config.raw.buildUrl, params);
    const token = await resolveAuthToken(config.raw);
    const protocols = createProtocolList(token, config.raw.additionalProtocols);
    return { url: finalUrl, protocols };
  };

  const provider: DeepgramProvider = {
    id: 'deepgram',
    transport: 'websocket',
    capabilities: CAPABILITIES,
    get tokenProvider() {
      return config.raw.tokenProvider;
    },
    getPreferredFormat(): RecorderFormatOptions {
      return { sampleRate: config.sampleRate, channels: config.channels, encoding: 'pcm16' };
    },
    getSupportedFormats(): ReadonlyArray<RecorderFormatOptions> {
      return SUPPORTED_FORMATS;
    },
    negotiateFormat(candidate: RecorderFormatOptions): RecorderFormatOptions {
      const negotiatedSampleRate = candidate.sampleRate ?? config.sampleRate;
      const negotiatedChannels = normalizeChannels(candidate.channels ?? config.channels);
      return {
        sampleRate: negotiatedSampleRate,
        channels: negotiatedChannels,
        encoding: 'pcm16',
      } satisfies RecorderFormatOptions;
    },
    async update(nextOptions) {
      config = resolveConfig(nextOptions);
      if (Object.hasOwn(nextOptions, 'logger')) {
        baseLogger = nextOptions.logger ?? null;
        providerLogger = baseLogger ? baseLogger.child('provider-deepgram') : undefined;
      }
      updateListeners.forEach((listener) => listener(config.raw));
    },
    onUpdate(listener) {
      updateListeners.add(listener);
      return () => {
        updateListeners.delete(listener);
      };
    },
    stream(_opts?: StreamOptions) {
      return createDeepgramStream({
        connectionFactory,
        logger: providerLogger,
        keepaliveMs: config.keepaliveMs,
        queueBudgetMs: config.queueBudgetMs,
      });
    },
  };

  return provider;
}
