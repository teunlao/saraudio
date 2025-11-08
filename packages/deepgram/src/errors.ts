import { AuthenticationError, NetworkError, ProviderError, RateLimitError } from '@saraudio/core';

export interface DeepgramErrorMessage {
  type?: string;
  message?: string;
  error?: string;
  err_msg?: string;
  err_code?: number;
  status?: number;
  code?: number;
  reason?: string;
  request_id?: string;
  retry_after?: number | string;
}

export function mapError(message: DeepgramErrorMessage): Error {
  const raw = { ...message };
  const errorMessage =
    typeof message.message === 'string'
      ? message.message
      : typeof message.err_msg === 'string'
        ? message.err_msg
        : typeof message.error === 'string'
          ? message.error
          : 'Deepgram error';
  const status = pickStatusCode(message);

  if (status === 401 || status === 402 || status === 403) {
    return new AuthenticationError(errorMessage, raw);
  }
  if (status === 429) {
    const retryAfter = parseRetryAfter(message.retry_after);
    return new RateLimitError(errorMessage, retryAfter, raw);
  }
  if (status && status >= 500) {
    return new ProviderError(errorMessage, 'deepgram', status, status, raw);
  }
  return new ProviderError(errorMessage, 'deepgram', message.err_code ?? status, status, raw);
}

export function mapClose(event: CloseEvent, closedByClient: boolean, url?: string): Error | null {
  const reason = typeof event.reason === 'string' ? event.reason.trim() : '';
  if (closedByClient && event.code === 1000) {
    return null;
  }
  if (reason.startsWith('{')) {
    try {
      const parsed = JSON.parse(reason) as DeepgramErrorMessage;
      return mapError(parsed);
    } catch {
      // ignore JSON parse issues; fall through
    }
  }
  if (!event.wasClean || event.code === 1006) {
    const msg = url
      ? `Deepgram connection closed unexpectedly (code=${event.code}, url=${url})`
      : 'Deepgram connection closed unexpectedly';
    return new NetworkError(msg, true, {
      code: event.code,
      reason,
    });
  }
  if (event.code === 1000) {
    return null;
  }
  const message = reason || 'Deepgram connection closed';
  const withUrl = url ? `${message} (code=${event.code}, url=${url})` : message;
  return new ProviderError(withUrl, 'deepgram', event.code, undefined, {
    code: event.code,
    reason,
  });
}

export function pickStatusCode(message: DeepgramErrorMessage): number | undefined {
  if (typeof message.status === 'number') return message.status;
  if (typeof message.code === 'number') return message.code;
  if (typeof message.err_code === 'number') return message.err_code;
  return undefined;
}

export function parseRetryAfter(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  return undefined;
}
