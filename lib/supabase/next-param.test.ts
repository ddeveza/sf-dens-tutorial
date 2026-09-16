import { describe, expect, it } from 'vitest';
import { DEFAULT_NEXT, safeNext } from './next-param.ts';

describe('safeNext', () => {
  it('returns a same-origin path unchanged', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
    expect(safeNext('/lesson/d001-what-is-metadata?step=caveman')).toBe('/lesson/d001-what-is-metadata?step=caveman');
    expect(safeNext('/')).toBe('/');
  });

  it('falls back to /dashboard when the parameter is missing or empty', () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
    expect(safeNext(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNext('')).toBe(DEFAULT_NEXT);
    expect(DEFAULT_NEXT).toBe('/dashboard');
  });

  it('blocks open redirects: protocol-relative, absolute and scheme-prefixed values', () => {
    expect(safeNext('//evil.example/phish')).toBe(DEFAULT_NEXT);
    expect(safeNext('https://evil.example/phish')).toBe(DEFAULT_NEXT);
    expect(safeNext('javascript:alert(1)')).toBe(DEFAULT_NEXT);
    expect(safeNext('dashboard')).toBe(DEFAULT_NEXT);
    expect(safeNext('/\\evil.example')).toBe(DEFAULT_NEXT);
  });

  it('rejects control characters and whitespace that browsers would normalise into a host', () => {
    expect(safeNext('/\tdashboard')).toBe(DEFAULT_NEXT);
    expect(safeNext('/dash\nboard')).toBe(DEFAULT_NEXT);
    expect(safeNext(' /dashboard')).toBe(DEFAULT_NEXT);
  });

  it('takes the first value when the framework hands over a repeated query parameter', () => {
    expect(safeNext(['/review', '//evil.example'])).toBe('/review');
    expect(safeNext([])).toBe(DEFAULT_NEXT);
  });
});
