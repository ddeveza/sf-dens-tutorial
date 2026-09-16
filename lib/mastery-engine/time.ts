// Pure timestamp helpers. Callers pass `now`; nothing here reads the clock.
export const MS_PER_DAY = 86_400_000;

export function epochMs(at: string | Date): number {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime();
  if (Number.isNaN(ms)) throw new TypeError(`mastery-engine: invalid timestamp ${String(at)}`);
  return ms;
}

export function toIso(at: string | Date): string {
  return new Date(epochMs(at)).toISOString();
}

export function addDays(at: string | Date, days: number): string {
  return new Date(epochMs(at) + days * MS_PER_DAY).toISOString();
}

export function daysBetween(from: string | Date, to: string | Date): number {
  return (epochMs(to) - epochMs(from)) / MS_PER_DAY;
}
