// Streak derived from qualifying local dates (v_qualifying_days). No streak_count column exists anywhere.
import type { AttemptKind, AttemptStatus } from '../assessments/types.ts';
import { GAMIFICATION_CONFIG, type StreakConfig } from './config.ts';
import { addDays, eachDay, minDate } from './dates.ts';
import type { StreakState } from './types.ts';

/** The values v_qualifying_days pins in SQL; streak.test.ts asserts they agree with the migration. */
export const STREAK_CONFIG: StreakConfig = GAMIFICATION_CONFIG.streak;

export function deriveStreak(days: ReadonlySet<string>, todayLocal: string, cfg: StreakConfig): StreakState {
  let run = 0;
  let shields = 0;
  let longest = 0;
  let sinceShield = 0;
  for (const d of eachDay(minDate(days), addDays(todayLocal, -1))) {
    if (days.has(d)) {
      run++;
      sinceShield++;
      if (sinceShield === cfg.shieldEveryDays) {
        shields = Math.min(shields + 1, cfg.maxBankedShields);
        sinceShield = 0;
      }
    } else if (shields > 0) {
      shields--; // bridged; run unchanged, the shielded day does not count toward the next shield
    } else {
      run = 0;
      sinceShield = 0;
    }
    longest = Math.max(longest, run);
  }
  const todayQualifies = days.has(todayLocal);
  if (todayQualifies) run++;
  return { current: run, longest: Math.max(longest, run), shieldBanked: shields > 0, atRisk: !todayQualifies, todayQualifies };
}

/**
 * Same rule as the SQL view, for callers that hold attempts but not the view (e.g. evaluating achievements
 * before record_attempt): evaluated rows only, >= minAttempts on the day or any free-text kind.
 */
export function qualifyingDaysFromAttempts(
  attempts: readonly { localDate: string; kind: AttemptKind; status: AttemptStatus }[],
  cfg: StreakConfig,
): Set<string> {
  const counts = new Map<string, { n: number; freeText: boolean }>();
  for (const a of attempts) {
    if (a.status !== 'evaluated') continue;
    const day = counts.get(a.localDate) ?? { n: 0, freeText: false };
    day.n += 1;
    if (cfg.freeTextKinds.includes(a.kind)) day.freeText = true;
    counts.set(a.localDate, day);
  }
  const out = new Set<string>();
  for (const [date, { n, freeText }] of counts) if (n >= cfg.minAttempts || freeText) out.add(date);
  return out;
}
