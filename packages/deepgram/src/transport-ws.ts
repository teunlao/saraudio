import type { Logger } from '@saraudio/utils';
import { buildTransportUrl } from '@saraudio/utils';
import { createProtocolList, resolveAuthToken } from './auth';
import type { DeepgramResolvedConfig } from './config';
import { createDeepgramStream, type DeepgramConnectionInfoFactory } from './stream';

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

    const token = await resolveAuthToken({
      auth: config.raw.auth,
      baseUrl: config.raw.baseUrl,
      query: config.raw.query,
    });

    // Build final URL and choose auth subprotocols.
    // Browser WS auth matches official SDK:
    //  - JWT (ephemeral) → subprotocols ['bearer', <jwt>]
    //  - API key        → subprotocols ['token',  <key>]
    const finalUrl = await buildTransportUrl(config.raw.baseUrl, defaultBase, params, 'websocket');
    // Use subprotocols for auth: 'token' for API key, 'bearer' for ephemeral JWT
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
