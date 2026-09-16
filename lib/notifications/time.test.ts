import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localParts } from './time.ts';

// 2026-09-07 is a Monday (Jan 1 2026 is a Thursday; day 250 of the year).
const MONDAY_2230Z = new Date('2026-09-07T22:30:00Z');

describe('localParts', () => {
  it('renders an instant in a fixed-offset zone (America/Sao_Paulo has no DST since 2019)', () => {
    expect(localParts(MONDAY_2230Z, 'America/Sao_Paulo')).toEqual({ hour: 19, date: '2026-09-07', weekday: 1 });
  });

  it('rolls the local date forward when the zone is ahead of UTC', () => {
    // Europe/Lisbon is WEST (UTC+1) in September.
    expect(localParts(new Date('2026-09-07T23:30:00Z'), 'Europe/Lisbon')).toEqual({ hour: 0, date: '2026-09-08', weekday: 2 });
    // Asia/Tokyo is UTC+9 year-round.
    expect(localParts(MONDAY_2230Z, 'Asia/Tokyo')).toEqual({ hour: 7, date: '2026-09-08', weekday: 2 });
  });

  it('keeps the local date behind UTC when the zone is west of Greenwich', () => {
    // 02:00Z Monday is 19:00 Sunday in Los Angeles (PDT, UTC-7).
    expect(localParts(new Date('2026-09-07T02:00:00Z'), 'America/Los_Angeles')).toEqual({ hour: 19, date: '2026-09-06', weekday: 0 });
  });

  it('honors half-hour offsets', () => {
    expect(localParts(new Date('2026-09-07T18:45:00Z'), 'Asia/Kolkata')).toEqual({ hour: 0, date: '2026-09-08', weekday: 2 });
  });

  it('follows DST in Europe/Lisbon: WET in January, WEST in September', () => {
    expect(localParts(new Date('2026-01-15T23:30:00Z'), 'Europe/Lisbon')).toEqual({ hour: 23, date: '2026-01-15', weekday: 4 });
    expect(localParts(new Date('2026-09-07T18:00:00Z'), 'Europe/Lisbon').hour).toBe(19);
  });

  it('follows the America/New_York spring-forward transition (2026-03-08 02:00 local)', () => {
    expect(localParts(new Date('2026-03-08T06:30:00Z'), 'America/New_York')).toEqual({ hour: 1, date: '2026-03-08', weekday: 0 });
    expect(localParts(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toEqual({ hour: 3, date: '2026-03-08', weekday: 0 });
  });

  it('reports the repeated hour twice on the Europe/Lisbon fall-back transition (2026-10-25)', () => {
    expect(localParts(new Date('2026-10-25T00:30:00Z'), 'Europe/Lisbon').hour).toBe(1);
    expect(localParts(new Date('2026-10-25T01:30:00Z'), 'Europe/Lisbon').hour).toBe(1);
    expect(localParts(new Date('2026-10-25T02:30:00Z'), 'Europe/Lisbon').hour).toBe(2);
  });

  it('never reports hour 24 at midnight (hourCycle h23)', () => {
    expect(localParts(new Date('2026-09-08T00:00:00Z'), 'UTC')).toEqual({ hour: 0, date: '2026-09-08', weekday: 2 });
    expect(localParts(new Date('2026-09-08T03:00:00Z'), 'America/Sao_Paulo').hour).toBe(0);
  });

  it('is deterministic for a given instant', () => {
    const a = localParts(MONDAY_2230Z, 'Europe/Lisbon');
    const b = localParts(new Date(MONDAY_2230Z.getTime()), 'Europe/Lisbon');
    expect(a).toEqual(b);
  });

  it('throws a RangeError for an unknown zone or an invalid date', () => {
    expect(() => localParts(MONDAY_2230Z, 'Mars/Olympus_Mons')).toThrow(RangeError);
    expect(() => localParts(new Date('not a date'), 'UTC')).toThrow(RangeError);
  });
});

describe('isValidTimeZone', () => {
  it('accepts UTC and canonical IANA zones', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Europe/Lisbon')).toBe(true);
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('Asia/Calcutta')).toBe(true);
  });

  it('accepts the current IANA names browsers report even when ICU lists the legacy canonical name', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Europe/Kyiv')).toBe(true);
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimeZone('Etc/GMT+3')).toBe(true);
    expect(localParts(new Date('2026-09-07T18:45:00Z'), 'Asia/Kolkata').hour).toBe(0);
  });

  it('rejects unknown, empty, malformed and non-identifier values', () => {
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('utc ')).toBe(false);
    expect(isValidTimeZone('utc')).toBe(false);
    expect(isValidTimeZone('GMT+3')).toBe(false);
    expect(isValidTimeZone('EST')).toBe(false);
    expect(isValidTimeZone('+03:00')).toBe(false);
    expect(isValidTimeZone('Europe/')).toBe(false);
    expect(isValidTimeZone('/Lisbon')).toBe(false);
  });
});
