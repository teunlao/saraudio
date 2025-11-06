// URL/query helpers and builders for Deepgram listen v1
// Each helper is a small pure function to make unit testing trivial.

/** Keyword boosting entry: either plain string term or structured with boost. */
export type KeywordInput =
  | string
  | {
      term: string;
      boost?: number;
    };

/** Replace rules: list of {search, replace} or a Record mapping. */
export type ReplaceInput =
  | ReadonlyArray<{
      search: string;
      replace: string;
    }>
  | Record<string, string>;

/** Append boolean query param if defined. */
export function appendBoolean(params: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value === undefined) return;
  params.set(key, value ? 'true' : 'false');
}

/** Append keyword boosting definitions in Deepgram expected format. */
export function appendKeywords(
  params: URLSearchParams,
  keywords: ReadonlyArray<KeywordInput> | Record<string, number>,
): void {
  if (Array.isArray(keywords)) {
    keywords.forEach((entry) => {
      if (typeof entry === 'string') {
        if (entry.length > 0) params.append('keywords', entry);
        return;
      }
      if (entry?.term) {
        const boost = entry.boost ?? 1;
        params.append('keywords', `${entry.term}:${boost}`);
      }
    });
    return;
  }
  Object.entries(keywords).forEach(([term, boost]) => {
    if (term.length === 0) return;
    params.append('keywords', `${term}:${boost}`);
  });
}

/** Append a list of string values as repeated query params. */
export function appendList(params: URLSearchParams, key: string, values: ReadonlyArray<string>): void {
  values.forEach((value) => {
    if (value.length === 0) return;
    params.append(key, value);
  });
}

/** Append find/replace rules in `search:replace` format accepted by Deepgram. */
export function appendReplace(params: URLSearchParams, replace: ReplaceInput): void {
  if (Array.isArray(replace)) {
    replace.forEach((rule) => {
      if (!rule.search) return;
      params.append('replace', `${rule.search}:${rule.replace ?? ''}`);
    });
    return;
  }
  Object.entries(replace).forEach(([search, replacement]) => {
    if (search.length === 0) return;
    params.append('replace', `${search}:${replacement}`);
  });
}

/** Append arbitrary extra query params (skips null/undefined). */
export function appendExtra(
  params: URLSearchParams,
  extra: Record<string, string | number | boolean | null | undefined>,
): void {
  Object.entries(extra).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.set(key, String(value));
  });
}

/** Build final URL from base + query or via custom builder callback. */
export async function buildUrl(
  baseUrl: string,
  builder: ((params: URLSearchParams) => string | Promise<string>) | undefined,
  params: URLSearchParams,
): Promise<string> {
  if (builder) {
    const result = await builder(params);
    return result;
  }
  const query = params.toString();
  return query.length > 0 ? `${baseUrl}?${query}` : baseUrl;
}
