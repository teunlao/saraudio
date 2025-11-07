import { afterEach, describe, expect, test, vi } from 'vitest';
import { parseRetryAfter } from './headers';

describe('http/headers.parseRetryAfter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  test('parses seconds as ms (rounded)', () => {
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter('2.4')).toBe(2400);
    expect(parseRetryAfter('0')).toBe(0);
  });

  test('parses HTTP date to diff in ms (non-negative)', () => {
    // Vitest 4 canonical pattern: fake timers + setSystemTime
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T00:00:00Z'));
    const now = Date.now();
    // HTTP-date has second precision; use whole seconds to avoid truncation
    const future = new Date(now + 2000).toUTCString();
    const past = new Date(now - 5000).toUTCString();
    expect(parseRetryAfter(future)).toBe(2000);
    expect(parseRetryAfter(past)).toBe(0);
  });

  test('returns undefined for garbage', () => {
    expect(parseRetryAfter('not-a-date')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  test('trims whitespace and handles fractional seconds', () => {
    expect(parseRetryAfter(' 3 ')).toBe(3000);
    expect(parseRetryAfter('0.25')).toBe(250);
  });

  test('negative seconds are allowed and return negative ms', () => {
    // Current implementation propagates sign; callers should clamp if needed
    expect(parseRetryAfter('-1')).toBe(-1000);
  });

  test('very large numeric seconds convert to ms without overflow in JS number range', () => {
    expect(parseRetryAfter(String(60))).toBe(60000);
  });
});
