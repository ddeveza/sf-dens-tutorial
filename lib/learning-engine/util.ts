// Pure helpers shared by the learning-engine modules. No IO, no clock: every instant is passed in.
import { BANDS, DEPTHS } from '../mastery-engine/types.ts';
import type { Band, Depth } from '../mastery-engine/types.ts';

/** Callers pass `now` either as an ISO string or a Date; engines never read the clock. */
export type Instant = string | Date;

export function toMs(instant: Instant): number {
  return typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
}

export function toIso(instant: Instant): string {
  return new Date(toMs(instant)).toISOString();
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Rounds and clamps onto the Deep-Enough scale. */
export function toDepth(value: number): Depth {
  const lo = DEPTHS[0];
  const hi = DEPTHS[DEPTHS.length - 1];
  return clamp(Math.round(value), lo, hi) as Depth;
}

export function bandRank(band: Band): number {
  return BANDS.indexOf(band);
}

export function bandAtLeast(band: Band, floor: Band): boolean {
  return bandRank(band) >= bandRank(floor);
}

/** Pure calendar arithmetic on a learner-local `YYYY-MM-DD`; never an instant, never a zone offset. */
export function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The learner-local calendar date (`YYYY-MM-DD`) of an instant in an IANA time zone. */
export function localDateOf(instant: Instant, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(toMs(instant)),
  );
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
