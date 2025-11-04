export interface RetryConfig {
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
  jitterRatio: number;
}

export interface RetryableError {
  retryAfterMs?: number;
}

export function computeBackoff(attempt: number, config: RetryConfig, error?: RetryableError): number {
  if (error?.retryAfterMs && typeof error.retryAfterMs === 'number' && error.retryAfterMs > 0) {
    return Math.min(error.retryAfterMs, config.maxDelayMs);
  }
  const exp = Math.min(config.baseDelayMs * config.factor ** Math.max(0, attempt - 1), config.maxDelayMs);
  if (!config.jitterRatio) return exp;
  const jitter = exp * config.jitterRatio * (Math.random() - 0.5) * 2;
  return Math.max(0, Math.min(config.maxDelayMs, Math.floor(exp + jitter)));
}
