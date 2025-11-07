import type { Logger } from '@saraudio/utils';
import { createProtocolList, resolveAuthToken } from './auth';
import type { DeepgramResolvedConfig } from './config';
import { createDeepgramStream, type DeepgramConnectionInfoFactory } from './stream';
import { buildUrl } from './url';

export function createWsStream(config: DeepgramResolvedConfig, logger?: Logger) {
  const providerLogger = logger ? logger.child('provider-deepgram') : undefined;
  const connectionFactory: DeepgramConnectionInfoFactory = async () => {
    const params = new URLSearchParams(config.baseParams);
    // append extra query if provided
    if (config.raw.query) {
      Object.entries(config.raw.query).forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        params.set(k, String(v));
      });
    }
    const defaultBase = 'wss://api.deepgram.com/v1/listen';
    const base = config.raw.baseUrl;
    const finalUrl =
      typeof base === 'function'
        ? await base({ defaultBaseUrl: defaultBase, params, transport: 'websocket' })
        : await buildUrl(typeof base === 'string' && base.length > 0 ? base : defaultBase, undefined, params);

    const token = await resolveAuthToken({
      auth: config.raw.auth,
      baseUrl: config.raw.baseUrl,
      query: config.raw.query,
    });
    const protocols = createProtocolList(token, config.raw.wsProtocols);
    return { url: finalUrl, protocols };
  };
  return createDeepgramStream({
    connectionFactory,
    logger: providerLogger,
    keepaliveMs: config.keepaliveMs,
    queueBudgetMs: config.queueBudgetMs,
  });
}
