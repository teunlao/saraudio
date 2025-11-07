import { describe, expect, test } from 'vitest';
import { appendBoolean, appendExtra, appendList, buildUrl, replaceParam } from './url';

describe('http/url helpers', () => {
  test('appendBoolean sets when defined', () => {
    const p = new URLSearchParams();
    appendBoolean(p, 'a', true);
    appendBoolean(p, 'b', false);
    appendBoolean(p, 'c', undefined);
    expect(p.get('a')).toBe('true');
    expect(p.get('b')).toBe('false');
    expect(p.has('c')).toBe(false);
  });

  test('appendList repeat style', () => {
    const p = new URLSearchParams();
    appendList(p, 'q', ['x', '', 'y'], 'repeat');
    const values = p.getAll('q');
    expect(values).toEqual(['x', 'y']);
  });

  test('appendList csv style', () => {
    const p = new URLSearchParams();
    appendList(p, 'q', ['a', 'b', ''], 'csv');
    expect(p.get('q')).toBe('a,b');
  });

  test('replaceParam removes when empty', () => {
    const p = new URLSearchParams([['x', '1']]);
    replaceParam(p, 'x', '');
    expect(p.has('x')).toBe(false);
    replaceParam(p, 'y', '2');
    expect(p.get('y')).toBe('2');
  });

  test('appendExtra skips nullish and stringifies others', () => {
    const p = new URLSearchParams();
    appendExtra(p, { a: '1', b: 2, c: false, d: null, e: undefined });
    expect(p.toString().split('&').sort()).toEqual(['a=1', 'b=2', 'c=false']);
  });

  test('buildUrl appends ? when none present', () => {
    const p = new URLSearchParams([['x', '1']]);
    const url = buildUrl('https://api.test/endpoint', p);
    expect(url).toBe('https://api.test/endpoint?x=1');
  });

  test('buildUrl appends & when query exists', () => {
    const p = new URLSearchParams([['y', '2']]);
    const url = buildUrl('https://api.test/endpoint?a=1', p);
    expect(url).toBe('https://api.test/endpoint?a=1&y=2');
  });
});
