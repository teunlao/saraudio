import type { RecorderFormatOptions } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { createProtocolList, resolveAuthToken } from './auth';
import { CAPABILITIES } from './capabilities';
import { type DeepgramResolvedConfig, normalizeChannels, resolveConfig } from './config';
import { type DeepgramModelId, SUPPORTED_FORMATS } from './models';
import { createDeepgramStream, type DeepgramConnectionInfoFactory } from './stream';
import type { WebSocketTransportStrategy } from './transport-strategy';
import type { DeepgramOptions } from './types';
import { buildUrl } from './url';

export function createWsTransport(
  options: DeepgramOptions<DeepgramModelId>,
  getLogger: () => Logger | undefined,
): WebSocketTransportStrategy {
  let config: DeepgramResolvedConfig = resolveConfig(options);

  const connectionFactory: DeepgramConnectionInfoFactory = async () => {
    const params = new URLSearchParams(config.baseParams);
    const finalUrl = await buildUrl(config.baseUrl, config.raw.buildUrl, params);
    const token = await resolveAuthToken(config.raw);
    const protocols = createProtocolList(token, config.raw.additionalProtocols);
    return { url: finalUrl, protocols };
  };

  return {
    kind: 'websocket',
    capabilities: CAPABILITIES,
    getPreferredFormat(): RecorderFormatOptions {
      return {
        sampleRate: config.sampleRate,
        channels: config.channels,
        encoding: 'pcm16',
      } satisfies RecorderFormatOptions;
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
    update(nextOptions: DeepgramOptions<DeepgramModelId>) {
      config = resolveConfig(nextOptions);
    },
    rawOptions(): DeepgramOptions<DeepgramModelId> {
      return config.raw;
    },
    tokenProvider(): (() => Promise<string>) | undefined {
      return config.raw.tokenProvider;
    },
    stream() {
      return createDeepgramStream({
        connectionFactory,
        logger: getLogger(),
        keepaliveMs: config.keepaliveMs,
        queueBudgetMs: config.queueBudgetMs,
      });
    },
  };
}
