import { describe, expect, it } from 'vitest';
import { SR_CONFIG } from './config.ts';
import { isDue, isOverdue, needsReviewNudge, reviewDebt, reviewSessionSelection, warmupSelection } from './debt.ts';
import type { ReviewItem } from './types.ts';

const TODAY = '2026-09-07';

function item(conceptId: string, dueOn: string, extra: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: `id-${conceptId}`,
    userId: 'u1',
    conceptId,
    dimension: 'understanding',
    depth: 3,
    questionType: 'explain_why',
    angle: 'why',
    excludeFormKeys: [],
    dueOn,
    intervalDays: 3,
    lastOutcome: null,
    reviewCount: 0,
    lapses: 0,
    reason: 'weak_dimension',
    ...extra,
  };
}

describe('isDue / isOverdue', () => {
  it('due is dueOn <= todayLocal; overdue is dueOn < todayLocal', () => {
    expect(isDue(item('a', '2026-09-06'), TODAY)).toBe(true);
    expect(isDue(item('a', '2026-09-07'), TODAY)).toBe(true);
    expect(isDue(item('a', '2026-09-08'), TODAY)).toBe(false);
    expect(isOverdue(item('a', '2026-09-06'), TODAY)).toBe(true);
    expect(isOverdue(item('a', '2026-09-07'), TODAY)).toBe(false);
    expect(isOverdue(item('a', '2026-09-08'), TODAY)).toBe(false);
  });

  it('compares calendar dates, not strings of different shape', () => {
    expect(() => isDue(item('a', '2026-9-7'), TODAY)).toThrow(TypeError);
  });
});

describe('reviewDebt', () => {
  it("reviewDebt counts items with dueOn <= todayLocal, not tomorrow's", () => {
    const items = [item('a', '2026-09-01'), item('b', '2026-09-06'), item('c', '2026-09-07'), item('d', '2026-09-08'), item('e', '2026-10-01')];
    expect(reviewDebt(items, TODAY)).toBe(3);
    expect(reviewDebt(items, '2026-09-08')).toBe(4);
    expect(reviewDebt([], TODAY)).toBe(0);
  });
});

describe('needsReviewNudge', () => {
  it('fires at reviewDebtNudge (5) due items, not below', () => {
    const four = ['a', 'b', 'c', 'd'].map((c) => item(c, '2026-09-07'));
    expect(needsReviewNudge(four, TODAY)).toBe(false);
    expect(needsReviewNudge([...four, item('e', '2026-09-01')], TODAY)).toBe(true);
    expect(needsReviewNudge([...four, item('e', '2026-09-08')], TODAY)).toBe(false);
    expect(needsReviewNudge(four, TODAY, { ...SR_CONFIG, reviewDebtNudge: 4 })).toBe(true);
  });
});

describe('warmupSelection', () => {
  it('shows min(warmupReviewMax, due) items, most overdue first, never tomorrow\'s', () => {
    const items = [
      item('today', '2026-09-07'),
      item('tomorrow', '2026-09-08'),
      item('oldest', '2026-08-30'),
      item('yesterday', '2026-09-06'),
      item('old', '2026-09-01'),
    ];
    const picked = warmupSelection(items, TODAY);
    expect(picked.map((i) => i.conceptId)).toEqual(['oldest', 'old', 'yesterday']);
    expect(warmupSelection(items.slice(0, 2), TODAY).map((i) => i.conceptId)).toEqual(['today']);
    expect(warmupSelection([], TODAY)).toEqual([]);
  });

  it('breaks same-day ties by conceptId for a stable order and honours config', () => {
    const items = [item('b', '2026-09-07'), item('a', '2026-09-07'), item('c', '2026-09-07')];
    expect(warmupSelection(items, TODAY).map((i) => i.conceptId)).toEqual(['a', 'b', 'c']);
    expect(warmupSelection(items, TODAY, { ...SR_CONFIG, warmupReviewMax: 2 }).map((i) => i.conceptId)).toEqual(['a', 'b']);
    expect(items.map((i) => i.conceptId)).toEqual(['b', 'a', 'c']); // input order untouched
  });
});

describe('reviewSessionSelection', () => {
  it('takes due items first, then the weakest not-yet-due items, up to reviewSessionMax (5)', () => {
    const items = [
      item('due2', '2026-09-05'),
      item('later-weak', '2026-09-20'),
      item('due1', '2026-09-01'),
      item('later-strong', '2026-09-10'),
      item('later-mid', '2026-09-15'),
      item('later-far', '2026-10-01'),
    ];
    const weakness: Record<string, number> = { 'later-weak': 20, 'later-strong': 90, 'later-mid': 55, 'later-far': 10 };
    const picked = reviewSessionSelection(items, TODAY, SR_CONFIG, (i) => weakness[i.conceptId] ?? 100);
    expect(picked.map((i) => i.conceptId)).toEqual(['due1', 'due2', 'later-far', 'later-weak', 'later-mid']);
  });

  it('without a weakness function, fills with the soonest-due items', () => {
    const items = [item('due', '2026-09-07'), item('far', '2026-10-01'), item('soon', '2026-09-09')];
    expect(reviewSessionSelection(items, TODAY).map((i) => i.conceptId)).toEqual(['due', 'soon', 'far']);
  });

  it('caps at reviewSessionMax even when more items are due', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((c) => item(c, '2026-09-01'));
    expect(reviewSessionSelection(items, TODAY)).toHaveLength(SR_CONFIG.reviewSessionMax);
    expect(reviewSessionSelection(items, TODAY, { ...SR_CONFIG, reviewSessionMax: 2 })).toHaveLength(2);
  });
});
