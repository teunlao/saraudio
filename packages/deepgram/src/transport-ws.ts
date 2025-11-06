import type { Logger } from '@saraudio/utils';
import { createProtocolList, resolveAuthToken } from './auth';
import type { DeepgramResolvedConfig } from './config';
import { createDeepgramStream, type DeepgramConnectionInfoFactory } from './stream';
import { buildUrl } from './url';

export function createWsStream(config: DeepgramResolvedConfig, logger?: Logger) {
  const providerLogger = logger ? logger.child('provider-deepgram') : undefined;
  const connectionFactory: DeepgramConnectionInfoFactory = async () => {
    const params = new URLSearchParams(config.baseParams);
    const finalUrl = await buildUrl(config.baseUrl, config.raw.buildUrl, params);
    const token = await resolveAuthToken(config.raw);
    const protocols = createProtocolList(token, config.raw.additionalProtocols);
    return { url: finalUrl, protocols };
  };
  return createDeepgramStream({
    connectionFactory,
    logger: providerLogger,
    keepaliveMs: config.keepaliveMs,
    queueBudgetMs: config.queueBudgetMs,
  });
}
