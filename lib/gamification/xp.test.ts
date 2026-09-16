import { describe, expect, it } from 'vitest';
import type { XpReason } from './types.ts';
import { BAND_REACHED_BANDS, GAMIFICATION_CONFIG, ONCE_ONLY_REASONS } from './config.ts';
import { amountFor, bandsReached, computeXpEvents, dedupeOnceOnly, multiplierFor, sumXp, type ComputeXpInput } from './xp.ts';
import { day13Events } from './testing.ts';

const config = GAMIFICATION_CONFIG;

function input(o: Partial<ComputeXpInput['attempt']> & Partial<Omit<ComputeXpInput, 'attempt' | 'config'>> = {}): ComputeXpInput {
  const {
    evaluation = null,
    masteryBefore = null,
    masteryAfter = null,
    lessonCompleted = false,
    priorAttemptsOnQuestion = 0,
    isIdenticalFormReplay = false,
    isReview = false,
    reviewCorrect = false,
    labPassed = false,
    ...attempt
  } = o;
  return {
    attempt: {
      kind: 'question',
      questionType: 'mcq',
      conceptId: 'soql.selectivity',
      exerciseId: 'd020-selectivity/q1',
      formKey: 'd020-selectivity/q1',
      depth: 1,
      correct: true,
      passed: true,
      lessonSlug: 'd020-selectivity',
      reviewItemId: null,
      bossKind: null,
      bossRef: null,
      ...attempt,
    },
    evaluation,
    masteryBefore,
    masteryAfter,
    lessonCompleted,
    priorAttemptsOnQuestion,
    isIdenticalFormReplay,
    isReview,
    reviewCorrect,
    labPassed,
    config,
  };
}

describe('amountFor / multiplierFor', () => {
  it('rounds half-up per event, never on the daily sum', () => {
    expect(amountFor(10, 3, 0, config)).toBe(13); // 12.5 -> 13
    expect(amountFor(25, 4, 0, config)).toBe(31); // 31.25 -> 31
    expect(amountFor(12, 4, 0, config)).toBe(15);
    expect(amountFor(30, 5, 0, config)).toBe(45);
    expect(amountFor(40, 5, 0, config)).toBe(60);
  });

  it('applies the depth multiplier table by depth band', () => {
    expect(multiplierFor(1, 0, config)).toBe(1);
    expect(multiplierFor(2, 0, config)).toBe(1);
    expect(multiplierFor(3, 0, config)).toBe(1.25);
    expect(multiplierFor(4, 0, config)).toBe(1.25);
    expect(multiplierFor(5, 0, config)).toBe(1.5);
    expect(multiplierFor(6, 0, config)).toBe(1.5);
    expect(multiplierFor(7, 0, config)).toBe(2);
    expect(multiplierFor(8, 0, config)).toBe(2);
  });

  it('halves the second attempt and zeroes the third and beyond', () => {
    expect(amountFor(10, 1, 0, config)).toBe(10);
    expect(amountFor(10, 1, 1, config)).toBe(5);
    expect(amountFor(10, 1, 2, config)).toBe(0);
    expect(amountFor(10, 1, 9, config)).toBe(0);
  });

  it('clamps out-of-range depth into the table', () => {
    expect(multiplierFor(0, 0, config)).toBe(1);
    expect(multiplierFor(99, 0, config)).toBe(2);
  });
});

describe('explained-correct > MCQ-correct invariant', () => {
  it('min free-text base exceeds max deterministic base x max depth multiplier', () => {
    const { base, depthMultiplier } = config.xp;
    const deterministic = [base.answer_correct, base.prediction_correct, base.review_answered, base.review_correct];
    const freeText = [base.explain_why_passed, base.scenario_passed, base.teach_back_passed];
    expect(Math.min(...freeText)).toBeGreaterThan(Math.max(...deterministic) * Math.max(...depthMultiplier));
  });
});

describe('pass thresholds mirror the mastery config', () => {
  it('xp.passThreshold equals MASTERY_CONFIG.correctThreshold / understandingBands', async () => {
    const { passThreshold } = config.xp;
    // understandingBands are boundaries: weak < `weak`, adequate = [`weak`, `strong`), strong >= `strong`.
    type Bands = { weak?: number; adequate?: number; strong: number };
    let mastery: { correctThreshold: number; understandingBands: Bands } | null = null;
    try {
      const mod = (await import('../mastery-engine/config.ts')) as { MASTERY_CONFIG?: { correctThreshold: number; understandingBands: Bands } };
      mastery = mod.MASTERY_CONFIG ?? null;
    } catch {
      mastery = null;
    }
    if (mastery) {
      const adequateFloor = mastery.understandingBands.adequate ?? mastery.understandingBands.weak;
      expect(passThreshold.correctness).toBe(mastery.correctThreshold);
      expect(passThreshold.understanding.explain_why).toBe(adequateFloor);
      expect(passThreshold.understanding.teach_back).toBe(mastery.understandingBands.strong);
    } else {
      // lib/mastery-engine/config.ts not present yet: pin the documented values (70 / adequate 50 / strong 70).
      expect(passThreshold).toEqual({ correctness: 70, understanding: { explain_why: 50, teach_back: 70 } });
    }
  });
});

describe('computeXpEvents: per-question reasons', () => {
  it('answer_correct for a correct deterministic question with the question id as ref', () => {
    const events = computeXpEvents(input({ depth: 3 }));
    expect(events).toEqual([{ reason: 'answer_correct', ref: 'd020-selectivity/q1', base: 10, multiplier: 1.25, amount: 13 }]);
  });

  it('wrong answers earn nothing', () => {
    expect(computeXpEvents(input({ correct: false, passed: false }))).toEqual([]);
    expect(computeXpEvents(input({ kind: 'prediction', questionType: 'predict_outcome', correct: false }))).toEqual([]);
  });

  it('prediction_correct uses its own base', () => {
    const [e] = computeXpEvents(input({ kind: 'prediction', questionType: 'predict_outcome', depth: 4 }));
    expect(e).toMatchObject({ reason: 'prediction_correct', base: 12, amount: 15 });
  });

  it('third attempt and identical-form replays are x0 and emit no row', () => {
    expect(computeXpEvents(input({ priorAttemptsOnQuestion: 2 }))).toEqual([]);
    expect(computeXpEvents(input({ isIdenticalFormReplay: true }))).toEqual([]);
    const [second] = computeXpEvents(input({ priorAttemptsOnQuestion: 1 }));
    expect(second).toMatchObject({ multiplier: 0.5, amount: 5 });
  });

  it('explain_why_passed needs correctness >= 70 and understanding >= 50', () => {
    const passed = computeXpEvents(
      input({ kind: 'explain_why', questionType: 'explain_why', depth: 4, evaluation: { correctness: 70, understanding: 50 } }),
    );
    expect(passed).toEqual([{ reason: 'explain_why_passed', ref: 'd020-selectivity/q1', base: 25, multiplier: 1.25, amount: 31 }]);
    expect(
      computeXpEvents(input({ kind: 'explain_why', questionType: 'explain_why', evaluation: { correctness: 72, understanding: 49 } })),
    ).toEqual([]);
    expect(
      computeXpEvents(input({ kind: 'explain_why', questionType: 'explain_why', evaluation: { correctness: 69, understanding: 90 } })),
    ).toEqual([]);
    expect(computeXpEvents(input({ kind: 'explain_why', questionType: 'explain_why', evaluation: null }))).toEqual([]);
  });

  it('teach_back_passed needs understanding >= 70; scenario_passed needs correctness >= 70', () => {
    expect(
      computeXpEvents(input({ kind: 'teach_back', questionType: 'teach_back', depth: 5, evaluation: { correctness: 75, understanding: 70 } })),
    ).toMatchObject([{ reason: 'teach_back_passed', base: 40, amount: 60 }]);
    expect(
      computeXpEvents(input({ kind: 'teach_back', questionType: 'teach_back', depth: 5, evaluation: { correctness: 75, understanding: 69 } })),
    ).toEqual([]);
    expect(
      computeXpEvents(
        input({ kind: 'scenario', questionType: 'architecture_decision', depth: 5, evaluation: { correctness: 70, understanding: 10 } }),
      ),
    ).toMatchObject([{ reason: 'scenario_passed', base: 30, amount: 45 }]);
    expect(
      computeXpEvents(input({ kind: 'scenario', questionType: 'scenario_diagnosis', depth: 5, evaluation: { correctness: 69, understanding: 90 } })),
    ).toEqual([]);
  });

  it('review answers earn review_answered regardless of outcome plus review_correct when right, never answer_correct', () => {
    const wrong = computeXpEvents(input({ isReview: true, reviewItemId: 'ri-1', correct: false, depth: 2 }));
    expect(wrong).toEqual([{ reason: 'review_answered', ref: 'ri-1', base: 5, multiplier: 1, amount: 5 }]);
    const right = computeXpEvents(input({ isReview: true, reviewItemId: 'ri-1', reviewCorrect: true, depth: 2 }));
    expect(right.map((e) => e.reason)).toEqual(['review_answered', 'review_correct']);
    expect(sumXp(right)).toBe(15);
  });
});

describe('computeXpEvents: flat reasons', () => {
  it('lab_completed is flat (no multiplier) with the exercise id as ref', () => {
    const events = computeXpEvents(input({ kind: 'lab', questionType: 'lab', depth: 8, labPassed: true, exerciseId: 'd013/lab-1' }));
    expect(events).toEqual([{ reason: 'lab_completed', ref: 'd013/lab-1', base: 30, multiplier: 1, amount: 30 }]);
    expect(computeXpEvents(input({ kind: 'lab', questionType: 'lab', labPassed: false, passed: false }))).toEqual([]);
  });

  it('lesson_completed is emitted once per lesson slug for completed and completed_early alike', () => {
    const events = computeXpEvents(input({ correct: false, lessonCompleted: true }));
    expect(events).toEqual([{ reason: 'lesson_completed', ref: 'd020-selectivity', base: 50, multiplier: 1, amount: 50 }]);
  });

  it('band_reached emits one row per band crossed with concept:band refs', () => {
    expect(bandsReached('lost', 'competent')).toEqual(['developing', 'competent']);
    expect(bandsReached('competent', 'developing')).toEqual([]);
    expect(bandsReached(null, 'familiar')).toEqual([]);
    expect(bandsReached('developing', 'mastered')).toEqual(['competent', 'strong', 'mastered']);
    const events = computeXpEvents(
      input({ correct: false, masteryBefore: { band: 'familiar' }, masteryAfter: { band: 'competent' } }),
    );
    expect(events).toEqual([
      { reason: 'band_reached', ref: 'soql.selectivity:developing', base: 20, multiplier: 1, amount: 20 },
      { reason: 'band_reached', ref: 'soql.selectivity:competent', base: 40, multiplier: 1, amount: 40 },
    ]);
    expect(BAND_REACHED_BANDS).toEqual(['developing', 'competent', 'strong', 'mastered']);
  });

  it('boss attempts route to the boss bases: attempted always, defeated when the verdict is true', () => {
    const mission = computeXpEvents(
      input({ kind: 'boss', questionType: 'boss', bossKind: 'mission', bossRef: 'w1-m1-basics', defeated: true, lessonSlug: 'boss-w1-m1-basics' }),
    );
    expect(mission).toEqual([
      { reason: 'mission_boss_attempted', ref: 'w1-m1-basics', base: 20, multiplier: 1, amount: 20 },
      { reason: 'mission_boss_defeated', ref: 'w1-m1-basics', base: 150, multiplier: 1, amount: 150 },
    ]);
    const weekly = computeXpEvents(input({ kind: 'boss', questionType: 'boss', bossKind: 'weekly', bossRef: 'weekly-w03', defeated: false }));
    expect(weekly).toEqual([{ reason: 'weekly_boss_attempted', ref: 'weekly-w03', base: 30, multiplier: 1, amount: 30 }]);
    const capstone = computeXpEvents(
      input({ kind: 'capstone', questionType: 'capstone', bossKind: 'capstone', bossRef: 'capstone', defeated: true }),
    );
    expect(capstone.map((e) => [e.reason, e.amount])).toEqual([
      ['capstone_attempted', 300],
      ['capstone_passed', 1000],
    ]);
  });
});

describe('once-only refs', () => {
  it('lists exactly the reasons the xp_once_per_ref index covers', () => {
    const expected: XpReason[] = [
      'lesson_completed',
      'band_reached',
      'lab_completed',
      'mission_boss_attempted',
      'mission_boss_defeated',
      'weekly_boss_attempted',
      'weekly_boss_defeated',
      'capstone_attempted',
      'capstone_passed',
      'achievement_unlocked',
    ];
    expect([...ONCE_ONLY_REASONS].sort()).toEqual([...expected].sort());
  });

  it('dedupeOnceOnly drops once-only events already in the ledger and keeps per-question rows', () => {
    const events = [
      ...computeXpEvents(input({ lessonCompleted: true })),
      ...computeXpEvents(input({ lessonCompleted: true, exerciseId: 'd020-selectivity/q2', formKey: 'd020-selectivity/q2' })),
    ];
    expect(events.filter((e) => e.reason === 'lesson_completed')).toHaveLength(2);
    const deduped = dedupeOnceOnly(events, [{ reason: 'lesson_completed', ref: 'd020-selectivity' }]);
    expect(deduped.filter((e) => e.reason === 'lesson_completed')).toHaveLength(0);
    expect(deduped.filter((e) => e.reason === 'answer_correct')).toHaveLength(2);
    // Within one batch, a repeated once-only ref is also collapsed to a single row.
    const collapsed = dedupeOnceOnly(events, []);
    expect(collapsed.filter((e) => e.reason === 'lesson_completed')).toHaveLength(1);
  });
});

describe('Day 13 worked example', () => {
  it('totals 401 XP with per-event rounding', () => {
    const events = day13Events(config);
    expect(sumXp(events)).toBe(401);
    const byReason = new Map<string, number>();
    for (const e of events) byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + e.amount);
    expect(Object.fromEntries(byReason)).toEqual({
      answer_correct: 65,
      prediction_correct: 30,
      explain_why_passed: 31,
      lab_completed: 30,
      scenario_passed: 45,
      teach_back_passed: 60,
      lesson_completed: 50,
      band_reached: 40,
      review_answered: 20,
      review_correct: 30,
    });
  });
});
