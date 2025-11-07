import { describe, expect, test } from 'vitest';
import { clamp } from './clamp';

describe('number/clamp', () => {
  test('clamps inside range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  test('clamps below', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });
  test('clamps above', () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });
  test('NaN/Infinity to min', () => {
    expect(clamp(Number.NaN, 1, 2)).toBe(1);
    expect(clamp(Number.POSITIVE_INFINITY, 1, 2)).toBe(1);
    expect(clamp(Number.NEGATIVE_INFINITY, 1, 2)).toBe(1);
  });
  test('boundaries equal to min/max return boundary', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
