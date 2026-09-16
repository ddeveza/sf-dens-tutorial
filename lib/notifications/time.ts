// "What hour is it now in zone X" and "what local date is it": Intl with full ICU (Node 24), no date-fns-tz.
// No DST arithmetic is ever performed; an instant is rendered in a zone, which is deterministic for a given `now`.
import type { LocalParts, Weekday } from './types.ts';

const WEEKDAY_INDEX: Readonly<Record<string, Weekday>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const HOURS_PER_DAY = 24;

/**
 * Local hour, calendar date and weekday of `now` in an IANA zone.
 * Throws a RangeError for an invalid Date or a zone ICU does not know (validate with `isValidTimeZone` first).
 */
export function localParts(now: Date, timeZone: string): LocalParts {
  if (Number.isNaN(now.getTime())) throw new RangeError('localParts: invalid Date');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new RangeError(`localParts: Intl returned no ${type} part for zone ${timeZone}`);
    return found.value;
  };
  const weekday = WEEKDAY_INDEX[part('weekday')];
  if (weekday === undefined) throw new RangeError(`localParts: unexpected weekday ${part('weekday')}`);
  return {
    // `% 24` guards against engines that render midnight as "24" despite hourCycle h23.
    hour: Number(part('hour')) % HOURS_PER_DAY,
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday,
  };
}

let supportedZones: Set<string> | null = null;

// `Area/Location` identifiers only ('Asia/Kolkata', 'America/Argentina/Buenos_Aires', 'Etc/GMT+3'); bare
// abbreviations ('EST'), offsets ('+03:00') and lowercase variants ('utc') are not accepted even though ICU parses them.
const IANA_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/;

/**
 * `Intl.supportedValuesOf('timeZone').includes(tz) || tz === 'UTC'` (the documented rule), extended for IANA links:
 * ICU's list holds its own canonical names ('Asia/Calcutta', 'Europe/Kiev') while browsers report the current IANA
 * names ('Asia/Kolkata', 'Europe/Kyiv'), so a slash-form identifier that ICU can format in is valid too.
 */
export function isValidTimeZone(tz: string): boolean {
  if (tz === 'UTC') return true;
  if (!supportedZones) supportedZones = new Set(Intl.supportedValuesOf('timeZone'));
  if (supportedZones.has(tz)) return true;
  if (!IANA_IDENTIFIER.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
