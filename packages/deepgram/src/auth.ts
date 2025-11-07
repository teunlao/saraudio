import type { UrlBuilder } from '@saraudio/core';
import { AuthenticationError } from '@saraudio/core';

export interface MinimalAuthOptions {
  auth?: {
    getToken?: () => Promise<string>;
    token?: string;
    apiKey?: string;
  };
  baseUrl?: string | UrlBuilder;
  query?: Record<string, string | number | boolean | null | undefined>;
}

export async function resolveAuthToken(options: MinimalAuthOptions): Promise<string | null> {
  const auth = options.auth;
  if (auth?.getToken) {
    const token = await auth.getToken();
    if (!token) {
      throw new AuthenticationError('Deepgram tokenProvider returned an empty token');
    }
    return token;
  }
  if (auth?.token) {
    if (auth.token.length === 0) {
      throw new AuthenticationError('Deepgram token must be non-empty');
    }
    return auth.token;
  }
  if (auth?.apiKey) {
    if (auth.apiKey.length === 0) {
      throw new AuthenticationError('Deepgram apiKey must be non-empty');
    }
    return auth.apiKey;
  }
  if (hasEmbeddedToken(options)) {
    return null;
  }
  throw new AuthenticationError('Deepgram requires an apiKey, token, or tokenProvider');
}

export function hasEmbeddedToken(options: MinimalAuthOptions): boolean {
  const base = typeof options.baseUrl === 'string' ? options.baseUrl : '';
  if (base.includes('token=') || base.includes('access_token=')) return true;
  const extra = options.query ?? {};
  return ['token', 'access_token', 'key'].some((k) => {
    const value = extra[k];
    return typeof value === 'string' && value.length > 0;
  });
}

export function createProtocolList(token: string | null, additional?: ReadonlyArray<string>): string[] | undefined {
  const extra = additional ? [...additional] : [];
  if (token) {
    extra.unshift(token);
    extra.unshift('token');
  }
  return extra.length > 0 ? extra : undefined;
}
