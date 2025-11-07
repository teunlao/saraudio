/**
 * Parse HTTP Retry-After header into milliseconds.
 * Supports seconds (number) and HTTP-date formats. Returns undefined when unparsable.
 */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.round(numeric * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return undefined;
}
