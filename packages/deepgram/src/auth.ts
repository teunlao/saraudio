import { AuthenticationError } from '@saraudio/core';

export interface MinimalAuthOptions {
  apiKey?: string;
  token?: string;
  tokenProvider?: () => Promise<string>;
  baseUrl?: string;
  extraQueryParams?: Record<string, string | number | boolean | null | undefined>;
}

export async function resolveAuthToken(options: MinimalAuthOptions): Promise<string | null> {
  if (options.tokenProvider) {
    const token = await options.tokenProvider();
    if (!token) {
      throw new AuthenticationError('Deepgram tokenProvider returned an empty token');
    }
    return token;
  }
  if (options.token) {
    if (options.token.length === 0) {
      throw new AuthenticationError('Deepgram token must be non-empty');
    }
    return options.token;
  }
  if (options.apiKey) {
    if (options.apiKey.length === 0) {
      throw new AuthenticationError('Deepgram apiKey must be non-empty');
    }
    return options.apiKey;
  }
  if (hasEmbeddedToken(options)) {
    return null;
  }
  throw new AuthenticationError('Deepgram requires an apiKey, token, or tokenProvider');
}

export function hasEmbeddedToken(options: MinimalAuthOptions): boolean {
  const base = options.baseUrl ?? '';
  if (base.includes('token=') || base.includes('access_token=')) {
    return true;
  }
  const extra = options.extraQueryParams ?? {};
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
