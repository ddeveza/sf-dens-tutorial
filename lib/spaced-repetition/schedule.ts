// Interval ladder and re-scheduling (Engine §7). One live item per (user, concept); `scheduleReview` returns the
// updated item plus the snake_case `reviewPatch` that `record_attempt` upserts. Pure calendar arithmetic only.
import { SR_CONFIG, type SrConfig } from './config.ts';
import { addDays, parseLocalDate } from './dates.ts';
import { toReviewPatch, type ReviewItemDraft, type ReviewPatch } from './patch.ts';
import type { IntervalDays, ReviewOutcome } from './types.ts';

export interface ScheduledReview<T extends ReviewItemDraft> {
  item: T;
  reviewPatch: ReviewPatch;
}

// An outcome that "held" the concept: forgetting after one of these is a lapse.
export function isHeldOutcome(outcome: ReviewOutcome | null): boolean {
  return outcome === 'strong' || outcome === 'mastered';
}

// `lapses++` when a fail follows a strong or mastered outcome.
export function countsAsLapse(outcome: ReviewOutcome, previousOutcome: ReviewOutcome | null): boolean {
  return outcome === 'fail' && isHeldOutcome(previousOutcome);
}

function baseInterval(outcome: ReviewOutcome, previousOutcome: ReviewOutcome | null, previousIntervalDays: IntervalDays, config: SrConfig): IntervalDays {
  const { intervals } = config;
  switch (outcome) {
    case 'fail':
      return intervals.fail;
    case 'struggle':
      return intervals.struggle;
    case 'strong':
      return intervals.strong;
    case 'mastered': {
      // 21, then 30 when the previous outcome was also mastered and that mastered review actually held for the
      // first mastered interval (a capped 3-day restart climbs back through 21 before reaching 30).
      const [first, repeat] = intervals.mastered;
      return previousOutcome === 'mastered' && previousIntervalDays >= first ? repeat : first;
    }
  }
}

// `lapses` is the count after the current outcome has been applied. Lapse ladder: once `afterLapses` lapses are
// on record, every interval is capped at `maxIntervalDays` until a strong-or-better outcome is on record
// (the capped strong itself restarts the ladder; the review after it runs the normal table again).
export function nextInterval(
  outcome: ReviewOutcome,
  previousOutcome: ReviewOutcome | null,
  previousIntervalDays: IntervalDays,
  lapses: number,
  config: SrConfig = SR_CONFIG,
): IntervalDays {
  const base = baseInterval(outcome, previousOutcome, previousIntervalDays, config);
  const { afterLapses, maxIntervalDays } = config.lapseLadderReset;
  if (lapses >= afterLapses && !isHeldOutcome(previousOutcome) && base > maxIntervalDays) return maxIntervalDays;
  return base;
}

export function scheduleReview<T extends ReviewItemDraft>(item: T, outcome: ReviewOutcome, todayLocal: string, config: SrConfig = SR_CONFIG): ScheduledReview<T> {
  parseLocalDate(todayLocal);
  const lapses = item.lapses + (countsAsLapse(outcome, item.lastOutcome) ? 1 : 0);
  const intervalDays = nextInterval(outcome, item.lastOutcome, item.intervalDays, lapses, config);
  const next: T = {
    ...item,
    excludeFormKeys: [...item.excludeFormKeys],
    dueOn: addDays(todayLocal, intervalDays),
    intervalDays,
    lastOutcome: outcome,
    reviewCount: item.reviewCount + 1,
    lapses,
  };
  return { item: next, reviewPatch: toReviewPatch(next) };
}

// In-memory mirror of the `(user_id, concept_id)` upsert: replaces the live item for that concept or appends.
export function upsertReviewItem<T extends ReviewItemDraft>(items: readonly T[], next: T): T[] {
  const out: T[] = [];
  let replaced = false;
  for (const item of items) {
    if (item.userId === next.userId && item.conceptId === next.conceptId) {
      if (!replaced) {
        out.push(next);
        replaced = true;
      }
      continue;
    }
    out.push(item);
  }
  if (!replaced) out.push(next);
  return out;
}
