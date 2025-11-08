import type { SessionAuthAdapter } from '@saraudio/core';

export interface CreateSessionAuthHandlerOptions {
  adapters: ReadonlyArray<SessionAuthAdapter>;
  /** Optional client safety buffer (ms) to subtract from provider TTL. Default: 2000. */
  ttlSafetyBufferMs?: number;
}

/** Minimal Response-like shape used by various runtimes. */
function jsonResponse(body: unknown, init?: number | ResponseInit): Response {
  const status = typeof init === 'number' ? init : (init?.status ?? 200);
  const headers = new Headers(typeof init === 'number' ? undefined : init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

function getUrl(req: Request): URL {
  try {
    return new URL(req.url);
  } catch {
    // Some runtimes pass only a path; fall back to localhost origin
    return new URL(String((req as unknown as { url?: string }).url ?? '/'), 'http://localhost');
  }
}

export function createSessionAuthHandler(options: CreateSessionAuthHandlerOptions) {
  const adapters = [...options.adapters];
  if (adapters.length === 0) throw new Error('createSessionAuthHandler: at least one adapter is required');
  const safetyMs = options.ttlSafetyBufferMs ?? 2000;

  const registry = new Map<string, SessionAuthAdapter>();
  for (const adapter of adapters) registry.set(adapter.id, adapter);

  return async function handle(req: Request): Promise<Response> {
    const url = getUrl(req);
    const search = url.searchParams;
    const providerId = search.get('provider') ?? undefined;

    let adapter: SessionAuthAdapter | undefined;
    if (registry.size === 1 && !providerId) {
      adapter = adapters[0];
    } else {
      if (!providerId) return jsonResponse({ error: true, message: 'Specify provider via ?provider=id' }, 400);
      adapter = registry.get(providerId);
    }

    const selected = adapter ?? undefined;
    if (!selected) {
      const msg = providerId ? `Unknown provider: ${providerId}` : 'Provider not specified';
      return jsonResponse({ error: true, message: msg }, 400);
    }

    try {
      const issued = await selected.issue();
      // Apply safety buffer defensively at the handler level
      const bufferSec = Math.max(0, Math.ceil(safetyMs / 1000));
      const expiresIn = Math.max(1, issued.expiresIn - bufferSec);
      return jsonResponse({ token: issued.token, expiresIn });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: true, message: msg }, 500);
    }
  };
}
