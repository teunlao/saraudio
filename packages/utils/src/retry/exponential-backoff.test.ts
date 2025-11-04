import { describe, expect, it } from 'vitest';
import { computeBackoff, type RetryConfig } from './exponential-backoff';

describe('computeBackoff', () => {
  const baseConfig: RetryConfig = {
    baseDelayMs: 300,
    factor: 2,
    maxDelayMs: 10_000,
    jitterRatio: 0,
  };

  it('returns baseDelayMs for first attempt', () => {
    expect(computeBackoff(1, baseConfig)).toBe(300);
  });

  it('applies exponential factor for subsequent attempts', () => {
    expect(computeBackoff(2, baseConfig)).toBe(600);
    expect(computeBackoff(3, baseConfig)).toBe(1200);
    expect(computeBackoff(4, baseConfig)).toBe(2400);
  });

  it('caps delay at maxDelayMs', () => {
    expect(computeBackoff(10, baseConfig)).toBe(10_000);
    expect(computeBackoff(100, baseConfig)).toBe(10_000);
  });

  it('uses error retryAfterMs if available', () => {
    const error = { retryAfterMs: 5000 };
    expect(computeBackoff(1, baseConfig, error)).toBe(5000);
  });

  it('caps error retryAfterMs at maxDelayMs', () => {
    const error = { retryAfterMs: 20_000 };
    expect(computeBackoff(1, baseConfig, error)).toBe(10_000);
  });

  it('ignores invalid retryAfterMs values', () => {
    expect(computeBackoff(1, baseConfig, { retryAfterMs: 0 })).toBe(300);
    expect(computeBackoff(1, baseConfig, { retryAfterMs: -100 })).toBe(300);
  });

  it('applies jitter when jitterRatio > 0', () => {
    const configWithJitter: RetryConfig = {
      ...baseConfig,
      jitterRatio: 0.5,
    };

    const delays = Array.from({ length: 100 }, () => computeBackoff(1, configWithJitter));
    const min = Math.min(...delays);
    const max = Math.max(...delays);

    expect(min).toBeGreaterThanOrEqual(150);
    expect(max).toBeLessThanOrEqual(450);
    expect(delays.some((d) => d !== delays[0])).toBe(true);
  });

  it('ensures jittered delay is non-negative', () => {
    const configWithJitter: RetryConfig = {
      ...baseConfig,
      jitterRatio: 2,
    };

    const delays = Array.from({ length: 100 }, () => computeBackoff(1, configWithJitter));
    expect(delays.every((d) => d >= 0)).toBe(true);
  });

  it('respects maxDelayMs with jitter', () => {
    const configWithJitter: RetryConfig = {
      ...baseConfig,
      jitterRatio: 0.5,
    };

    const delays = Array.from({ length: 100 }, () => computeBackoff(10, configWithJitter));
    expect(delays.every((d) => d <= 10_000)).toBe(true);
  });

  it('handles attempt = 0', () => {
    expect(computeBackoff(0, baseConfig)).toBe(300);
  });

  it('handles negative attempt', () => {
    expect(computeBackoff(-1, baseConfig)).toBe(300);
  });
});
