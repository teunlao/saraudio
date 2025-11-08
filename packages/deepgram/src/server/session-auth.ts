import type { SessionAuthAdapter, SessionAuthIssueResult } from '@saraudio/core';

export interface DeepgramSessionAdapterOptions {
  /** Provide server API key directly (otherwise read from process.env.DEEPGRAM_API_KEY). */
  apiKey?: string;
  /** Default TTL seconds to request; Deepgram defaults to ~30s even without explicit body. */
  ttlSeconds?: number;
}

export function sessionAuthAdapter(options: DeepgramSessionAdapterOptions = {}): SessionAuthAdapter {
  const id = 'deepgram';
  const envKey = process.env.DEEPGRAM_API_KEY ?? process.env.NUXT_DEEPGRAM_API_KEY; // common env names
  const apiKey = options.apiKey ?? envKey ?? '';

  interface GrantResponse {
    access_token?: string;
    expires_in?: number;
    message?: string;
  }

  async function parseJson<T>(res: Response): Promise<T | null> {
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  return {
    id,
    async issue(input) {
      const ttl = input?.ttlSeconds ?? options.ttlSeconds; // currently not forwarded; DG accepts defaults
      const url = 'https://api.deepgram.com/v1/auth/grant';
      const headers: HeadersInit = {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      };

      const body = ttl && Number.isFinite(ttl) ? JSON.stringify({ ttl }) : JSON.stringify({});
      const res = await fetch(url, { method: 'POST', headers, body });
      const json = await parseJson<GrantResponse>(res);
      if (!res.ok) {
        const msg = json?.message ?? 'Deepgram grant failed';
        throw new Error(`${msg} (status ${res.status})`);
      }

      const token = json?.access_token;
      const expiresIn = typeof json?.expires_in === 'number' ? json?.expires_in : 30;
      if (typeof token !== 'string' || token.length === 0) throw new Error('Deepgram grant returned empty token');
      const result: SessionAuthIssueResult = { token, expiresIn, provider: id };
      return result;
    },
  };
}
