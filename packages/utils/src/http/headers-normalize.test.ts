import { describe, expect, test } from 'vitest';
import { mergeHeaders, normalizeHeaders, toHeaders } from './headers-normalize';

describe('http/headers-normalize', () => {
  test('normalizes object record (stringifies values, skips nullish)', () => {
    const rec = normalizeHeaders({ A: '1', B: 2, C: false, D: null, E: undefined });
    expect(rec).toEqual({ a: '1', b: '2', c: 'false' });
  });

  test('normalizes Headers instance and keeps duplicates via combine', () => {
    const h = new Headers();
    h.append('X-Id', 'a');
    h.append('X-Id', 'b');
    const rec = normalizeHeaders(h); // defaults: lowercase + combine
    expect(rec['x-id']).toBe('a, b');
  });

  test('normalizes tuple array input', () => {
    const rec = normalizeHeaders([
      ['X-Trace', 't1'],
      ['x-trace', 't2'],
    ]);
    expect(rec['x-trace']).toBe('t1, t2');
  });

  test('duplicate strategy: last', () => {
    const rec = normalizeHeaders(
      [
        ['X-A', '1'],
        ['X-A', '2'],
      ],
      { duplicates: 'last' },
    );
    expect(rec['x-a']).toBe('2');
  });

  test('duplicate strategy: first', () => {
    const rec = normalizeHeaders(
      [
        ['X-A', '1'],
        ['X-A', '2'],
      ],
      { duplicates: 'first' },
    );
    expect(rec['x-a']).toBe('1');
  });

  test('preserve case when lowercase=false', () => {
    const rec = normalizeHeaders({ 'X-Case': 'A' }, { lowercase: false });
    expect(rec['X-Case']).toBe('A');
  });

  test('mergeHeaders favors extra over base', () => {
    const merged = mergeHeaders({ a: '1' }, { A: '2' });
    expect(merged).toEqual({ a: '2' });
  });

  test('toHeaders builds real Headers with normalized pairs', () => {
    const h = toHeaders({ A: '1', B: 2 });
    expect(h.get('a')).toBe('1');
    expect(h.get('b')).toBe('2');
  });
});
