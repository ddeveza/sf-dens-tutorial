// Pure calendar-date arithmetic on 'YYYY-MM-DD' strings. All math runs on UTC midnights so DST never shifts a
// day; callers pass learner-local dates that were stamped elsewhere (Postgres `local_date`, or localDateOf()).
const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function toUtcMs(iso: string): number {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new RangeError(`not a YYYY-MM-DD date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Every date from `from` to `to` inclusive; nothing when `from` is missing or after `to`. */
export function* eachDay(from: string | undefined, to: string): Generator<string> {
  if (!from || from > to) return;
  const end = toUtcMs(to);
  for (let ms = toUtcMs(from); ms <= end; ms += DAY_MS) yield fromUtcMs(ms);
}

export function minDate(dates: Iterable<string>): string | undefined {
  let min: string | undefined;
  for (const d of dates) if (min === undefined || d < min) min = d;
  return min;
}

export function maxDate(dates: Iterable<string>): string | undefined {
  let max: string | undefined;
  for (const d of dates) if (max === undefined || d > max) max = d;
  return max;
}

function partsIn(instant: string | Date, timeZone: string): { year: number; month: number; day: number; hour: number } | null {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    }).formatToParts(date);
    const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? Number.NaN);
    const out = { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24 };
    return Object.values(out).some(Number.isNaN) ? null : out;
  } catch {
    return null;
  }
}

/** Calendar date of an instant in an IANA zone; falls back to UTC for an invalid zone. */
export function localDateOf(instant: string | Date, timeZone: string): string {
  const p = partsIn(instant, timeZone);
  if (!p) {
    const date = typeof instant === 'string' ? new Date(instant) : instant;
    return date.toISOString().slice(0, 10);
  }
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Hour (0-23) of an instant in an IANA zone; falls back to UTC for an invalid zone. */
export function localHourOf(instant: string | Date, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  if (p) return p.hour;
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return date.getUTCHours();
}

/** ISO-8601 week label ('2026-W37') for a calendar date. */
export function isoWeekOf(iso: string): string {
  const ms = toUtcMs(iso);
  const date = new Date(ms);
  const weekday = date.getUTCDay() || 7; // Monday = 1 .. Sunday = 7
  const thursday = new Date(ms + (4 - weekday) * DAY_MS);
  const isoYear = thursday.getUTCFullYear();
  const firstThursdayWeekday = new Date(Date.UTC(isoYear, 0, 4)).getUTCDay() || 7;
  const week1Monday = Date.UTC(isoYear, 0, 4) - (firstThursdayWeekday - 1) * DAY_MS;
  const week = Math.floor((thursday.getTime() - week1Monday) / (7 * DAY_MS)) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
