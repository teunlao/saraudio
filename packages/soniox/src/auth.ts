import { AuthenticationError } from '@saraudio/core';
import type { SonioxOptions } from './types';

export async function resolveApiKey(options: SonioxOptions): Promise<string> {
  if (options.token && options.token.length > 0) return options.token;
  if (options.apiKey && options.apiKey.length > 0) return options.apiKey;
  if (options.tokenProvider) {
    const t = await options.tokenProvider();
    if (typeof t === 'string' && t.length > 0) return t;
  }
  throw new AuthenticationError('Soniox requires an API key or token');
}
