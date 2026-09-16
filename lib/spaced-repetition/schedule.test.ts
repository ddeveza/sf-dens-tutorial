import { describe, expect, it } from 'vitest';
import { SR_CONFIG, type SrConfig } from './config.ts';
import { addDays } from './dates.ts';
import { nextInterval, scheduleReview, upsertReviewItem } from './schedule.ts';
import type { ReviewItem } from './types.ts';

const TODAY = '2026-03-28';

const base: ReviewItem = {
  id: 'r1',
  userId: 'u1',
  conceptId: 'soql-in-loops',
  dimension: 'understanding',
  depth: 3,
  questionType: 'explain_why',
  angle: 'why',
  excludeFormKeys: ['q1', 'q2'],
  dueOn: TODAY,
  intervalDays: 3,
  lastOutcome: null,
  reviewCount: 0,
  lapses: 0,
  reason: 'weak_dimension',
};

describe('intervals', () => {
  it('fail 1, struggle 3, strong 7, mastered 21 then 30 on consecutive mastered', () => {
    expect(scheduleReview(base, 'fail', TODAY).item.intervalDays).toBe(1);
    expect(scheduleReview(base, 'struggle', TODAY).item.intervalDays).toBe(3);
    expect(scheduleReview(base, 'strong', TODAY).item.intervalDays).toBe(7);

    const first = scheduleReview({ ...base, lastOutcome: 'strong', intervalDays: 7 }, 'mastered', TODAY).item;
    expect(first.intervalDays).toBe(21);
    const second = scheduleReview(first, 'mastered', first.dueOn).item;
    expect(second.intervalDays).toBe(30);
    const third = scheduleReview(second, 'mastered', second.dueOn).item;
    expect(third.intervalDays).toBe(30);
  });

  it('mastered after any non-mastered outcome restarts at 21', () => {
    expect(scheduleReview({ ...base, lastOutcome: 'fail', intervalDays: 1 }, 'mastered', TODAY).item.intervalDays).toBe(21);
    expect(scheduleReview({ ...base, lastOutcome: null }, 'mastered', TODAY).item.intervalDays).toBe(21);
  });

  it('reads the interval table from config', () => {
    const config: SrConfig = { ...SR_CONFIG, intervals: { fail: 1, struggle: 3, strong: 7, mastered: [30, 30] } };
    expect(scheduleReview({ ...base, lastOutcome: 'strong' }, 'mastered', TODAY, config).item.intervalDays).toBe(30);
  });
});

describe('lapse ladder', () => {
  it('fail after mastered increments lapses; fail after strong too; fail after struggle or fail does not', () => {
    expect(scheduleReview({ ...base, lastOutcome: 'mastered', intervalDays: 21 }, 'fail', TODAY).item.lapses).toBe(1);
    expect(scheduleReview({ ...base, lastOutcome: 'strong', intervalDays: 7 }, 'fail', TODAY).item.lapses).toBe(1);
    expect(scheduleReview({ ...base, lastOutcome: 'struggle' }, 'fail', TODAY).item.lapses).toBe(0);
    expect(scheduleReview({ ...base, lastOutcome: 'fail', intervalDays: 1 }, 'fail', TODAY).item.lapses).toBe(0);
    expect(scheduleReview({ ...base, lastOutcome: 'mastered', lapses: 1 }, 'struggle', TODAY).item.lapses).toBe(1);
  });

  it('two lapses cap interval at 3 until next strong', () => {
    const lapsed: ReviewItem = { ...base, lapses: 2, lastOutcome: 'fail', intervalDays: 1 };

    // The ladder restarts at 3: even a mastered-grade review gets 3 days, never 21.
    const mastered = scheduleReview(lapsed, 'mastered', TODAY).item;
    expect(mastered.intervalDays).toBe(3);
    expect(mastered.dueOn).toBe('2026-03-31');
    expect(nextInterval('mastered', lapsed.lastOutcome, lapsed.intervalDays, lapsed.lapses)).toBe(3);

    const strong = scheduleReview(lapsed, 'strong', TODAY).item;
    expect(strong.intervalDays).toBe(3);

    // Once a strong (or better) outcome is on record the normal ladder resumes.
    expect(scheduleReview(strong, 'strong', strong.dueOn).item.intervalDays).toBe(7);
    const climbing = scheduleReview(mastered, 'mastered', mastered.dueOn).item;
    expect(climbing.intervalDays).toBe(21); // climbs from the restarted rung; 30 needs a 21-day hold first
    expect(scheduleReview(climbing, 'mastered', climbing.dueOn).item.intervalDays).toBe(30);

    // Fail and struggle already sit at or below the cap.
    expect(scheduleReview(lapsed, 'fail', TODAY).item.intervalDays).toBe(1);
    expect(scheduleReview(lapsed, 'struggle', TODAY).item.intervalDays).toBe(3);
  });

  it('the second lapse itself caps the following review', () => {
    const once: ReviewItem = { ...base, lapses: 1, lastOutcome: 'mastered', intervalDays: 21 };
    const secondLapse = scheduleReview(once, 'fail', TODAY).item;
    expect(secondLapse.lapses).toBe(2);
    expect(secondLapse.intervalDays).toBe(1);
    expect(scheduleReview(secondLapse, 'strong', secondLapse.dueOn).item.intervalDays).toBe(3);
  });

  it('one lapse does not cap', () => {
    const once: ReviewItem = { ...base, lapses: 1, lastOutcome: 'fail', intervalDays: 1 };
    expect(scheduleReview(once, 'strong', TODAY).item.intervalDays).toBe(7);
    expect(scheduleReview(once, 'mastered', TODAY).item.intervalDays).toBe(21);
  });

  it('reads the ladder reset from config', () => {
    const config = { ...SR_CONFIG, lapseLadderReset: { afterLapses: 1, maxIntervalDays: 1 as const } };
    const once: ReviewItem = { ...base, lapses: 1, lastOutcome: 'fail', intervalDays: 1 };
    expect(scheduleReview(once, 'strong', TODAY, config).item.intervalDays).toBe(1);
  });
});

describe('scheduleReview', () => {
  it('dueOn = todayLocal + intervalDays by pure date arithmetic (2026-03-28 + 3 => 2026-03-31; no zone offset involved)', () => {
    const { item, reviewPatch } = scheduleReview(base, 'struggle', '2026-03-28');
    expect(item.dueOn).toBe('2026-03-31');
    expect(reviewPatch.due_on).toBe('2026-03-31');
    expect(scheduleReview(base, 'strong', '2026-12-28').item.dueOn).toBe('2027-01-04');
    expect(scheduleReview({ ...base, lastOutcome: 'strong' }, 'mastered', '2028-02-08').item.dueOn).toBe('2028-02-29');
  });

  it('increments reviewCount, records lastOutcome, keeps the question fields and identity', () => {
    const { item } = scheduleReview({ ...base, reviewCount: 4 }, 'strong', TODAY);
    expect(item.reviewCount).toBe(5);
    expect(item.lastOutcome).toBe('strong');
    expect(item.id).toBe('r1');
    expect(item.userId).toBe('u1');
    expect(item.conceptId).toBe('soql-in-loops');
    expect(item.dimension).toBe('understanding');
    expect(item.depth).toBe(3);
    expect(item.questionType).toBe('explain_why');
    expect(item.angle).toBe('why');
    expect(item.excludeFormKeys).toEqual(['q1', 'q2']);
    expect(item.reason).toBe('weak_dimension');
  });

  it('returns the reviewPatch in DB snake_case with exactly the review_items columns record_attempt upserts', () => {
    const { reviewPatch } = scheduleReview({ ...base, lastOutcome: 'strong', reviewCount: 2, lapses: 1 }, 'mastered', TODAY);
    expect(reviewPatch).toEqual({
      concept_id: 'soql-in-loops',
      dimension: 'understanding',
      depth: 3,
      question_type: 'explain_why',
      angle: 'why',
      exclude_form_keys: ['q1', 'q2'],
      due_on: addDays(TODAY, 21),
      interval_days: 21,
      last_outcome: 'mastered',
      review_count: 3,
      lapses: 1,
      reason: 'weak_dimension',
    });
    expect(Object.keys(reviewPatch).sort()).toEqual(
      [
        'angle',
        'concept_id',
        'depth',
        'dimension',
        'due_on',
        'exclude_form_keys',
        'interval_days',
        'lapses',
        'last_outcome',
        'question_type',
        'reason',
        'review_count',
      ].sort(),
    );
  });

  it('does not mutate the input item', () => {
    const input: ReviewItem = { ...base, excludeFormKeys: ['q1'] };
    const snapshot = structuredClone(input);
    scheduleReview(input, 'fail', TODAY);
    expect(input).toEqual(snapshot);
  });

  it('accepts a draft without an id (fresh item before its first upsert)', () => {
    const { id: _id, ...draft } = base;
    void _id;
    const { item } = scheduleReview(draft, 'strong', TODAY);
    expect(item.intervalDays).toBe(7);
    expect('id' in item).toBe(false);
  });
});

describe('upsertReviewItem', () => {
  it('upsert keeps one item per (user, concept)', () => {
    const other: ReviewItem = { ...base, id: 'r2', conceptId: 'governor-limits' };
    const otherUser: ReviewItem = { ...base, id: 'r3', userId: 'u2' };
    const items = [base, other, otherUser];

    const rescheduled = scheduleReview(base, 'strong', TODAY).item;
    const next = upsertReviewItem(items, rescheduled);

    expect(next).toHaveLength(3);
    expect(next.filter((i) => i.userId === 'u1' && i.conceptId === 'soql-in-loops')).toHaveLength(1);
    expect(next.find((i) => i.userId === 'u1' && i.conceptId === 'soql-in-loops')?.intervalDays).toBe(7);
    expect(next).toContain(other);
    expect(next).toContain(otherUser);
    expect(items).toHaveLength(3); // input untouched

    const appended = upsertReviewItem(next, { ...base, id: 'r4', conceptId: 'sharing-model' });
    expect(appended).toHaveLength(4);
  });
});
