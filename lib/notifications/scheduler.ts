// Pure due-selection (ARCHITECTURE.md Curriculum §D "Selection rules inside selectDue"). No IO, no env, no clock:
// the caller passes `now`; Intl renders it in each learner's zone deterministically.
import type { NotificationConfig } from './config.ts';
import { isValidTimeZone, localParts } from './time.ts';
import type { DueCandidate, DueSelection, NotificationKind } from './types.ts';

const STUDY_SLOT_KINDS: readonly NotificationKind[] = ['daily_reminder', 'review_due'];

/**
 * Which (user, kind, localDate) emails are due at `now`. Per candidate, with local hour `h`, date `d` and weekday
 * from `pref.timeZone` (falling back to `config.defaultTimeZone` for an unknown zone):
 * - skip unless `enabled` and (`frequency = 'daily'` or the local weekday is in `weekdayFrequencyDays`);
 * - skip once the learner has studied today (nothing left to remind about);
 * - study slot: `preferredHour <= h < preferredHour + catchupWindowHours` and no daily_reminder/review_due row
 *   for `d`; kind is `review_due` when `reviewDueReminder && reviewsDue > 0`, else `daily_reminder`;
 * - streak slot: `streakReminder && streakDays >= streakMinDays &&
 *   h >= min(preferredHour + streakOffsetHours, streakLatestHour)` and no streak_at_risk row for `d`;
 * - at most `maxPerUserPerDay` emails per learner per local day, rows already logged included.
 * The window never wraps past local midnight: the next local day is a new `local_date` key.
 */
export function selectDue(now: Date, candidates: readonly DueCandidate[], config: NotificationConfig): DueSelection[] {
  const out: DueSelection[] = [];
  for (const candidate of candidates) {
    const { pref } = candidate;
    if (!pref.enabled) continue;

    const zone = isValidTimeZone(pref.timeZone) ? pref.timeZone : config.defaultTimeZone;
    const { hour: h, date: d, weekday } = localParts(now, zone);
    if (pref.frequency === 'weekdays' && !config.weekdayFrequencyDays.includes(weekday)) continue;
    if (candidate.studiedToday) continue;

    const sent = new Set<NotificationKind>(candidate.sentToday);
    let budget = config.maxPerUserPerDay - sent.size;
    if (budget <= 0) continue;

    const inStudyWindow = pref.preferredHour <= h && h < pref.preferredHour + config.catchupWindowHours;
    const studySlotOpen = !STUDY_SLOT_KINDS.some((kind) => sent.has(kind));
    if (inStudyWindow && studySlotOpen) {
      const kind: NotificationKind = pref.reviewDueReminder && candidate.reviewsDue > 0 ? 'review_due' : 'daily_reminder';
      out.push({ userId: pref.userId, kind, localDate: d });
      budget -= 1;
    }
    if (budget <= 0) continue;

    const streakHour = Math.min(pref.preferredHour + config.streakOffsetHours, config.streakLatestHour);
    const streakAtRisk = pref.streakReminder && candidate.streakDays >= config.streakMinDays && h >= streakHour;
    if (streakAtRisk && !sent.has('streak_at_risk')) {
      out.push({ userId: pref.userId, kind: 'streak_at_risk', localDate: d });
    }
  }
  return out;
}
