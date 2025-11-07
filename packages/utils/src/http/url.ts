/** Append boolean param when value is defined. */
export function appendBoolean(params: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value === undefined) return;
  params.set(key, value ? 'true' : 'false');
}

/** Append a list of values either as repeated keys or as csv. */
export function appendList(
  params: URLSearchParams,
  key: string,
  values: ReadonlyArray<string>,
  style: 'repeat' | 'csv' = 'repeat',
): void {
  if (style === 'csv') {
    const filtered = values.filter((v) => v.length > 0);
    if (filtered.length > 0) params.set(key, filtered.join(','));
    return;
  }
  for (const v of values) {
    if (v.length === 0) continue;
    params.append(key, v);
  }
}

/** Replace a param with a single value. Removes the key when value is empty string. */
export function replaceParam(params: URLSearchParams, key: string, value: string): void {
  if (value.length === 0) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}

/** Append arbitrary extra query params (skips null/undefined). */
export function appendExtra(
  params: URLSearchParams,
  extra: Record<string, string | number | boolean | null | undefined>,
): void {
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined) continue;
    params.set(k, String(v));
  }
}

/**
 * Build a final URL from a base and query params.
 * - When params is empty, returns baseUrl as-is.
 * - When baseUrl already has '?', uses '&' delimiter.
 */
export function buildUrl(baseUrl: string, params: URLSearchParams): string {
  const query = params.toString();
  if (query.length === 0) return baseUrl;
  if (baseUrl.includes('?')) {
    return baseUrl.endsWith('?') || baseUrl.endsWith('&') ? `${baseUrl}${query}` : `${baseUrl}&${query}`;
  }
  return `${baseUrl}?${query}`;
}

export type TransportKind = 'http' | 'websocket';

export type UrlBuilderFn = (ctx: {
  defaultBaseUrl: string;
  params: URLSearchParams;
  transport: TransportKind;
}) => string | Promise<string>;

/**
 * Resolve final URL from a union base (string | builder | undefined).
 * - If builder provided, delegates entirely to it (receives defaultBaseUrl, params, transport).
 * - If string provided, appends params via buildUrl.
 * - Otherwise uses defaultBaseUrl.
 */
export async function buildTransportUrl(
  base: string | UrlBuilderFn | undefined,
  defaultBaseUrl: string,
  params: URLSearchParams,
  transport: TransportKind,
): Promise<string> {
  if (typeof base === 'function') return await base({ defaultBaseUrl, params, transport });
  const baseUrl = typeof base === 'string' && base.length > 0 ? base : defaultBaseUrl;
  return buildUrl(baseUrl, params);
}
