import { AuthenticationError } from '@saraudio/core';
import type { SonioxOptions } from './types';

/**
 * Resolve credential for Soniox.
 * Priority (to match Deepgram and encourage secure flows):
 * 1) getToken() → short‑lived token / temp API key
 * 2) token      → explicit bearer/token string
 * 3) apiKey     → long‑lived API key (server‑side)
 */
export async function resolveApiKey(options: SonioxOptions): Promise<string> {
  const auth = options.auth;
  if (auth?.getToken) {
    const token = await auth.getToken();
    if (typeof token === 'string' && token.length > 0) return token;
  }
  if (auth?.token && auth.token.length > 0) return auth.token;
  if (auth?.apiKey && auth.apiKey.length > 0) return auth.apiKey;
  throw new AuthenticationError('Soniox requires a tokenProvider, token, or apiKey');
}
