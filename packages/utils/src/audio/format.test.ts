import { describe, expect, test } from 'vitest';
import { normalizeChannels } from './format';

describe('audio/format.normalizeChannels', () => {
  test('returns 1 for <=1', () => {
    expect(normalizeChannels(0)).toBe(1);
    expect(normalizeChannels(1)).toBe(1);
  });
  test('returns 2 for >=2', () => {
    expect(normalizeChannels(2)).toBe(2 as const);
    expect(normalizeChannels(8)).toBe(2 as const);
  });
  test('floats below 2 are treated as 1', () => {
    expect(normalizeChannels(1.5)).toBe(1);
  });
  test('negative numbers are treated as 1', () => {
    expect(normalizeChannels(-3)).toBe(1);
  });
  test('large integers normalize to 2', () => {
    expect(normalizeChannels(16)).toBe(2 as const);
  });
});
