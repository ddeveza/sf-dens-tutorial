// Pure calendar arithmetic on learner-local `YYYY-MM-DD` strings (review_items.due_on is a Postgres `date`).
// No Date objects, no instants, no zone offsets, no DST: a day is a day. Proleptic Gregorian calendar via
// Howard Hinnant's days_from_civil / civil_from_days; day number 0 is 1970-01-01.

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const UNIX_EPOCH_SHIFT = 719468; // days from 0000-03-01 to 1970-01-01
const DAYS_PER_ERA = 146097; // 400 Gregorian years

export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

function civilOrNull(value: string): CivilDate | null {
  const match = LOCAL_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isLocalDate(value: string): boolean {
  return civilOrNull(value) !== null;
}

// Throws TypeError on anything that is not a real calendar date in canonical `YYYY-MM-DD` form.
export function parseLocalDate(value: string): CivilDate {
  const civil = civilOrNull(value);
  if (!civil) throw new TypeError(`expected a YYYY-MM-DD calendar date, got "${value}"`);
  return civil;
}

export function formatLocalDate({ year, month, day }: CivilDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function civilToDayNumber({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // year of era [0, 399]
  const mp = month > 2 ? month - 3 : month + 9; // March-based month [0, 11]
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1; // day of year, March 1st = 0
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // day of era
  return era * DAYS_PER_ERA + doe - UNIX_EPOCH_SHIFT;
}

export function dayNumberToCivil(dayNumber: number): CivilDate {
  const z = dayNumber + UNIX_EPOCH_SHIFT;
  const era = Math.floor(z / DAYS_PER_ERA);
  const doe = z - era * DAYS_PER_ERA;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

// Whole days since 1970-01-01 (negative before it).
export function toDayNumber(yyyyMmDd: string): number {
  return civilToDayNumber(parseLocalDate(yyyyMmDd));
}

export function fromDayNumber(dayNumber: number): string {
  if (!Number.isInteger(dayNumber)) throw new TypeError(`expected an integer day number, got ${dayNumber}`);
  return formatLocalDate(dayNumberToCivil(dayNumber));
}

// `dueOn = addDays(todayLocal, intervalDays)`: 2026-03-28 + 3 => 2026-03-31 regardless of any clock change in between.
export function addDays(yyyyMmDd: string, n: number): string {
  if (!Number.isInteger(n)) throw new TypeError(`expected an integer number of days, got ${n}`);
  return fromDayNumber(toDayNumber(yyyyMmDd) + n);
}

export function compareDates(a: string, b: string): -1 | 0 | 1 {
  const left = toDayNumber(a);
  const right = toDayNumber(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

// Whole days from `from` to `to` (positive when `to` is later).
export function diffDays(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}
