import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  diffDays,
  formatLocalDate,
  fromDayNumber,
  isLocalDate,
  parseLocalDate,
  toDayNumber,
} from './dates.ts';

// Oracle for the property test only: UTC arithmetic has no zone or DST effects, so it is a fair reference
// for pure civil-calendar arithmetic. The engine itself never touches Date.
function utcOracle(yyyyMmDd: string, n: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

describe('addDays', () => {
  it('2026-03-28 + 3 => 2026-03-31 by pure calendar arithmetic (EU clocks change on 2026-03-29; no zone offset involved)', () => {
    expect(addDays('2026-03-28', 3)).toBe('2026-03-31');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-12-25', 30)).toBe('2027-01-24');
  });

  it('knows leap years, including the Gregorian century rules', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
  });

  it('crosses the US clock change (2026-11-01) without gaining or losing a day', () => {
    expect(addDays('2026-11-01', 7)).toBe('2026-11-08');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('accepts negative and zero offsets', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-09-07', 0)).toBe('2026-09-07');
  });

  it('rejects non-integer offsets and malformed dates', () => {
    expect(() => addDays('2026-09-07', 1.5)).toThrow(TypeError);
    expect(() => addDays('2026-09-07', Number.NaN)).toThrow(TypeError);
    expect(() => addDays('2026-9-7', 1)).toThrow(TypeError);
    expect(() => addDays('2026-09-07T00:00:00Z', 1)).toThrow(TypeError);
  });

  it('agrees with UTC date arithmetic across 3000 consecutive days and several offsets', () => {
    const start = '2024-01-01';
    for (let i = 0; i < 3000; i += 1) {
      const day = addDays(start, i);
      expect(day).toBe(utcOracle(start, i));
      for (const n of [1, 3, 7, 21, 30, -1, -400]) {
        expect(addDays(day, n)).toBe(utcOracle(day, n));
      }
    }
  });
});

describe('compareDates', () => {
  it('orders calendar dates', () => {
    expect(compareDates('2026-03-28', '2026-03-31')).toBe(-1);
    expect(compareDates('2026-03-31', '2026-03-28')).toBe(1);
    expect(compareDates('2026-03-28', '2026-03-28')).toBe(0);
    expect(compareDates('2025-12-31', '2026-01-01')).toBe(-1);
  });

  it('rejects malformed input rather than comparing strings blindly', () => {
    expect(() => compareDates('2026-3-28', '2026-03-31')).toThrow(TypeError);
  });
});

describe('diffDays', () => {
  it('returns to - from in whole days', () => {
    expect(diffDays('2026-03-28', '2026-03-31')).toBe(3);
    expect(diffDays('2026-03-31', '2026-03-28')).toBe(-3);
    expect(diffDays('2026-03-28', '2026-03-28')).toBe(0);
    expect(diffDays('2027-12-31', '2028-12-31')).toBe(366);
  });
});

describe('day numbers', () => {
  it('count days since 1970-01-01 and round-trip', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('1970-01-02')).toBe(1);
    expect(toDayNumber('1969-12-31')).toBe(-1);
    expect(fromDayNumber(0)).toBe('1970-01-01');
    expect(fromDayNumber(toDayNumber('2026-09-07'))).toBe('2026-09-07');
    expect(toDayNumber('2000-03-01')).toBe(11017);
  });
});

describe('parseLocalDate / formatLocalDate / isLocalDate', () => {
  it('parses a valid YYYY-MM-DD and formats with zero padding', () => {
    expect(parseLocalDate('2026-09-07')).toEqual({ year: 2026, month: 9, day: 7 });
    expect(formatLocalDate({ year: 2026, month: 9, day: 7 })).toBe('2026-09-07');
  });

  it('rejects impossible calendar dates and non-canonical strings', () => {
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-00-10')).toBe(false);
    expect(isLocalDate('2026-04-31')).toBe(false);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-3-1')).toBe(false);
    expect(isLocalDate('')).toBe(false);
    expect(() => parseLocalDate('2026-02-30')).toThrow(TypeError);
  });
});
