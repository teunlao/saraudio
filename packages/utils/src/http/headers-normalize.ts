export type HeaderValue = string | number | boolean;
export type HeaderRecord = Record<string, HeaderValue | undefined | null>;

export interface NormalizeHeadersOptions {
  /** Normalize header names to lowercase. Default: true. */
  lowercase?: boolean;
  /**
   * Strategy for duplicates (after name normalization):
   * - 'combine': join values with ', ' (HTTP list semantics)
   * - 'last': take last occurrence
   * - 'first': take first occurrence
   * Default: 'combine'.
   */
  duplicates?: 'combine' | 'last' | 'first';
}

function isHeadersObject(value: unknown): value is Headers {
  // In test/runtime environments Headers might be undefined
  const Ctor = (globalThis as unknown as { Headers?: typeof Headers }).Headers;
  return typeof Ctor !== 'undefined' && value instanceof Ctor;
}

function toPairsFromHeaders(h: Headers): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  h.forEach((v, k) => {
    pairs.push([k, v]);
  });
  return pairs;
}

function isTupleArray(value: unknown): value is ReadonlyArray<readonly [string, string]> {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (!Array.isArray(item)) return false;
    if (item.length < 2) return false;
    const [k, v] = item as unknown[];
    if (typeof k !== 'string' || typeof v !== 'string') return false;
  }
  return true;
}

function toPairsFromTupleArray(list: ReadonlyArray<readonly [string, string]>): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of list) {
    pairs.push([k, v]);
  }
  return pairs;
}

function isRecordObject(value: unknown): value is HeaderRecord {
  return typeof value === 'object' && value !== null && !isHeadersObject(value) && !Array.isArray(value);
}

function toPairsFromRecord(rec: HeaderRecord): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined || v === null) continue;
    pairs.push([k, String(v)]);
  }
  return pairs;
}

function _isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Convert any valid HeadersInit into a canonical record (by default: lowercased names). */
export function normalizeHeaders(
  init: HeadersInit | HeaderRecord | undefined,
  options?: NormalizeHeadersOptions,
): Record<string, string> {
  const lowercase = options?.lowercase !== false;
  const dup = options?.duplicates ?? 'combine';
  const result: Record<string, string> = {};
  const push = (name: string, value: string): void => {
    const key = lowercase ? name.toLowerCase() : name;
    if (key in result) {
      if (dup === 'combine') result[key] = `${result[key]}, ${value}`;
      else if (dup === 'last') result[key] = value;
      // 'first' keeps existing
      return;
    }
    result[key] = value;
  };

  if (!init) return result;
  if (isHeadersObject(init)) {
    for (const [k, v] of toPairsFromHeaders(init)) push(k, v);
    return result;
  }
  if (isTupleArray(init)) {
    for (const [k, v] of toPairsFromTupleArray(init)) push(k, v);
    return result;
  }
  if (isRecordObject(init)) {
    for (const [k, v] of toPairsFromRecord(init)) push(k, v);
    return result;
  }
  // Fallback: tuple-like arrays
  const candidate: unknown = init;
  if (Array.isArray(candidate)) {
    for (const entry of candidate) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const key = String(entry[0]);
        const val = String(entry[1]);
        push(key, val);
      }
    }
    return result;
  }
  return result;
}

/** Merge two HeadersInit into a canonical record with predictable duplicate handling. */
export function mergeHeaders(
  base: HeadersInit | HeaderRecord | undefined,
  extra: HeadersInit | HeaderRecord | undefined,
  options?: NormalizeHeadersOptions,
): Record<string, string> {
  const opt = options ?? {};
  const a = normalizeHeaders(base, { lowercase: opt.lowercase, duplicates: 'last' });
  const b = normalizeHeaders(extra, { lowercase: opt.lowercase, duplicates: 'last' });
  const merged: Record<string, string> = { ...a };
  for (const [k, v] of Object.entries(b)) merged[k] = v;
  if (opt.duplicates && opt.duplicates !== 'last') {
    // Re-apply duplicate policy by reducing entries
    const entries: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(merged)) entries.push([k, v]);
    const final: Record<string, string> = {};
    for (const [k, v] of entries) {
      if (k in final) {
        if (opt.duplicates === 'combine') final[k] = `${final[k]}, ${v}`;
        // 'first' keeps existing
      } else final[k] = v;
    }
    return final;
  }
  return merged;
}

/** Create a real Headers object from any HeadersInit, via normalizeHeaders. */
export function toHeaders(init: HeadersInit | HeaderRecord | undefined, options?: NormalizeHeadersOptions): Headers {
  const rec = normalizeHeaders(init, options);
  const h = new Headers();
  for (const [k, v] of Object.entries(rec)) h.set(k, v);
  return h;
}
