import type { SessionAuthAdapter, SessionAuthIssueResult } from '@saraudio/core';

export interface SonioxSessionAdapterOptions {
  /** Provide server API key directly (otherwise read from process.env.SONIOX_API_KEY). */
  apiKey?: string;
  /** Desired TTL in seconds (1..3600); provider may clamp. Default 30s. */
  ttlSeconds?: number;
}

export function sessionAuthAdapter(options: SonioxSessionAdapterOptions = {}): SessionAuthAdapter {
  const id = 'soniox';
  const envKey = process.env.SONIOX_API_KEY ?? process.env.NUXT_SONIOX_API_KEY; // common env names
  const apiKey = options.apiKey ?? envKey ?? '';

  interface TempKeyResponse {
    api_key?: string;
    expires_at?: string; // RFC3339
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
      const ttl = Math.max(1, Math.min(3600, input?.ttlSeconds ?? options.ttlSeconds ?? 30));
      const url = 'https://api.soniox.com/v1/auth/temporary-api-key';
      const headers: HeadersInit = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      const body = JSON.stringify({ usage_type: 'transcribe_websocket', expires_in_seconds: ttl });
      const res = await fetch(url, { method: 'POST', headers, body });
      const json = await parseJson<TempKeyResponse>(res);
      if (!res.ok) {
        const msg = json?.message ?? 'Soniox temporary key failed';
        throw new Error(`${msg} (status ${res.status})`);
      }
      const token = json?.api_key;
      const expiresAt = json?.expires_at;
      if (typeof token !== 'string' || token.length === 0) throw new Error('Soniox temporary key is empty');
      let expiresIn = 28; // safe default
      if (typeof expiresAt === 'string') {
        const ms = Date.parse(expiresAt) - Date.now();
        if (Number.isFinite(ms) && ms > 0) expiresIn = Math.max(1, Math.floor(ms / 1000));
      }
      const result: SessionAuthIssueResult = { token, expiresIn, provider: id };
      return result;
    },
  };
}
