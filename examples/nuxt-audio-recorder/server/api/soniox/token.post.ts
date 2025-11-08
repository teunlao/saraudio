import { createError, defineEventHandler } from 'h3';

type TempKeyResponse = { api_key: string; expires_at: string };

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const apiKey = config.sonioxApiKey as string | undefined;

  if (!apiKey || apiKey.trim().length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'Soniox server API key is missing. Set NUXT_SONIOX_API_KEY.' });
  }

  // Per Soniox REST docs: POST /v1/auth/temporary-api-key (singular)
  const url = 'https://api.soniox.com/v1/auth/temporary-api-key';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ usage_type: 'transcribe_websocket', expires_in_seconds: 30 }),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    let message = 'Failed to create Soniox temporary API key';
    if (body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)) {
      const m = (body as Record<string, unknown>).message;
      if (typeof m === 'string') message = m;
    }
    throw createError({ statusCode: response.status, statusMessage: message });
  }

  return body as TempKeyResponse;
});
