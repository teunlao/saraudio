import { createError, defineEventHandler } from 'h3';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const apiKey = config.deepgramApiKey as string | undefined;

  if (!apiKey?.trim()) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Deepgram server API key is missing. Set NUXT_DEEPGRAM_API_KEY.',
    });
  }

  const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: 30 }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to grant Deepgram token' }));
    throw createError({
      statusCode: response.status,
      statusMessage: error.message || 'Failed to grant Deepgram token',
    });
  }

  // Returns { access_token: string, expires_in: number }
  return response.json();
});
