// Review debt and selection (Engine §7). Due-ness is defined once: due = dueOn <= todayLocal (the same
// predicate as `db/queries/reviews.getDueReviewItems` and the derived-stats count), overdue = dueOn < todayLocal.
import { SR_CONFIG, type SrConfig } from './config.ts';
import { compareDates } from './dates.ts';
import type { ReviewItem } from './types.ts';

export type DueItem = Pick<ReviewItem, 'dueOn'>;
export type SelectableItem = Pick<ReviewItem, 'dueOn' | 'conceptId'>;

export function isDue(item: DueItem, todayLocal: string): boolean {
  return compareDates(item.dueOn, todayLocal) <= 0;
}

export function isOverdue(item: DueItem, todayLocal: string): boolean {
  return compareDates(item.dueOn, todayLocal) < 0;
}

// count(dueOn <= todayLocal)
export function reviewDebt(items: readonly DueItem[], todayLocal: string): number {
  return items.filter((item) => isDue(item, todayLocal)).length;
}

// Debt at or above `reviewDebtNudge`: highlights "Review weakness" on the dashboard and flags the reminder email.
export function needsReviewNudge(items: readonly DueItem[], todayLocal: string, config: SrConfig = SR_CONFIG): boolean {
  return reviewDebt(items, todayLocal) >= config.reviewDebtNudge;
}

function byDueThenConcept<T extends SelectableItem>(a: T, b: T): number {
  const byDue = compareDates(a.dueOn, b.dueOn);
  if (byDue !== 0) return byDue;
  if (a.conceptId < b.conceptId) return -1;
  if (a.conceptId > b.conceptId) return 1;
  return 0;
}

// Due items, most overdue first (stable: same-day ties by conceptId). Never mutates the input.
export function dueItems<T extends SelectableItem>(items: readonly T[], todayLocal: string): T[] {
  return items.filter((item) => isDue(item, todayLocal)).sort(byDueThenConcept);
}

// Warm-up shows min(warmupReviewMax, due); the remainder lives in /review.
export function warmupSelection<T extends SelectableItem>(items: readonly T[], todayLocal: string, config: SrConfig = SR_CONFIG): T[] {
  return dueItems(items, todayLocal).slice(0, config.warmupReviewMax);
}

// /review and `review_weakness`: up to reviewSessionMax items, due items first, then not-yet-due items ordered by
// `weakness` (lower = weaker, typically the concept's weakest dimension score) when given, else by soonest due date.
export function reviewSessionSelection<T extends SelectableItem>(
  items: readonly T[],
  todayLocal: string,
  config: SrConfig = SR_CONFIG,
  weakness?: (item: T) => number,
): T[] {
  const due = dueItems(items, todayLocal);
  if (due.length >= config.reviewSessionMax) return due.slice(0, config.reviewSessionMax);
  const upcoming = items
    .filter((item) => !isDue(item, todayLocal))
    .sort((a, b) => {
      if (weakness) {
        const byWeakness = weakness(a) - weakness(b);
        if (byWeakness !== 0) return byWeakness;
      }
      return byDueThenConcept(a, b);
    });
  return [...due, ...upcoming].slice(0, config.reviewSessionMax);
}
