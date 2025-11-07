import { AuthenticationError } from '@saraudio/core';
import type { SonioxOptions } from './types';

export async function resolveApiKey(options: SonioxOptions): Promise<string> {
  const auth = options.auth;
  if (auth?.token && auth.token.length > 0) return auth.token;
  if (auth?.apiKey && auth.apiKey.length > 0) return auth.apiKey;
  if (auth?.getToken) {
    const t = await auth.getToken();
    if (typeof t === 'string' && t.length > 0) return t;
  }
  throw new AuthenticationError('Soniox requires an API key or token');
}
