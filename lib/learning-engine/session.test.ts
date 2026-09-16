import { describe, expect, it } from 'vitest';
import type { ReviewItem } from '../spaced-repetition/types.ts';
import { ENGINE_CONFIG, LEARNING_CONFIG, type LearningConfig } from './config.ts';
import {
  addLocalDays,
  applyFlexAction,
  buildChallengeGate,
  currentStep,
  earlyAdvanceOffered,
  gapReviewItems,
  lessonProgress,
  localDateOf,
  nextSegment,
  resolveChallengeGate,
  reviewWeaknessItems,
  selectSpacedReviewItems,
  shouldNudgeContinueTomorrow,
  type FlexActionInput,
  type FlexSession,
  type NudgeInput,
} from './session.ts';
import { STEP_ORDER } from './step-machine.ts';
import { LESSON_ID, NOW, TODAY, TOMORROW, mastery, progressedThrough, stepStates } from './test-fixtures.ts';

const SESSION: FlexSession = { userId: 'user-1', now: NOW, todayLocal: TODAY, timeZone: 'UTC' };

function reviewItem(over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'r-1',
    userId: 'user-1',
    conceptId: 'c-1',
    dimension: 'understanding',
    depth: 2,
    questionType: 'explain_why',
    angle: 'why',
    excludeFormKeys: [],
    dueOn: TODAY,
    intervalDays: 1,
    lastOutcome: null,
    reviewCount: 0,
    lapses: 0,
    reason: 'scheduled',
    ...over,
  };
}

describe('lessonProgress', () => {
  it('is 0 when nothing is done, 100 when every step is completed or skipped', () => {
    expect(lessonProgress(stepStates(() => 'locked'))).toBe(0);
    expect(lessonProgress([])).toBe(0);
    expect(lessonProgress(stepStates(() => 'completed'))).toBe(100);
    expect(lessonProgress(stepStates((_, i) => (i % 2 ? 'completed' : 'skipped')))).toBe(100);
  });

  it('counts done steps over the twelve session steps, rounded', () => {
    expect(lessonProgress(stepStates((_, i) => (i < 6 ? 'completed' : 'locked')))).toBe(50);
    expect(lessonProgress(stepStates((_, i) => (i < 1 ? 'completed' : 'locked')))).toBe(8);
    expect(lessonProgress(stepStates((_, i) => (i < 4 ? 'completed' : i === 4 ? 'active' : 'locked')))).toBe(33);
  });

  it('currentStep is the first not-done step and nextSegment is its segment', () => {
    expect(currentStep(progressedThrough(null))).toBe('warmup');
    expect(currentStep(progressedThrough('technical'))).toBe('simulation');
    expect(nextSegment(progressedThrough('technical'))).toBe('deep_dive');
    expect(currentStep(stepStates(() => 'completed'))).toBe('real_world_scenario');
    expect(nextSegment(stepStates(() => 'completed'))).toBe('challenge');
    expect(currentStep([])).toBe('warmup');
  });
});

describe('continue-tomorrow nudge: once per session, suppressed after the learner continues, never for a lesson started after minute 60', () => {
  const base: NudgeInput = {
    now: '2026-09-07T10:30:00.000Z',
    sessionStartedAt: '2026-09-07T10:00:00.000Z',
    lessonStartedAt: '2026-09-07T10:05:00.000Z',
    segment: 'learn',
    segmentElapsedMs: 5 * 60_000,
    nudgesShown: 0,
    learnerContinued: false,
  };

  it('fires when a segment runs past 1.5x its budget', () => {
    expect(shouldNudgeContinueTomorrow(base)).toBe(false);
    expect(shouldNudgeContinueTomorrow({ ...base, segmentElapsedMs: 15 * 60_000 })).toBe(false);
    expect(shouldNudgeContinueTomorrow({ ...base, segmentElapsedMs: 15 * 60_000 + 1 })).toBe(true);
    expect(shouldNudgeContinueTomorrow({ ...base, segment: 'lab', segmentElapsedMs: 22 * 60_000 })).toBe(false);
    expect(shouldNudgeContinueTomorrow({ ...base, segment: 'lab', segmentElapsedMs: 23 * 60_000 })).toBe(true);
  });

  it('fires when the session passes 60 minutes elapsed', () => {
    expect(shouldNudgeContinueTomorrow({ ...base, now: '2026-09-07T11:00:00.000Z' })).toBe(false);
    expect(shouldNudgeContinueTomorrow({ ...base, now: '2026-09-07T11:00:01.000Z' })).toBe(true);
  });

  it('is shown at most once per session and never after the learner explicitly continues', () => {
    const over = { ...base, now: '2026-09-07T11:30:00.000Z' };
    expect(shouldNudgeContinueTomorrow(over)).toBe(true);
    expect(shouldNudgeContinueTomorrow({ ...over, nudgesShown: 1 })).toBe(false);
    expect(shouldNudgeContinueTomorrow({ ...over, learnerContinued: true })).toBe(false);
  });

  it('never fires for a lesson started after the 60-minute mark', () => {
    const late = { ...base, now: '2026-09-07T11:40:00.000Z', lessonStartedAt: '2026-09-07T11:05:00.000Z', segmentElapsedMs: 30 * 60_000 };
    expect(shouldNudgeContinueTomorrow(late)).toBe(false);
    const atMark = { ...late, lessonStartedAt: '2026-09-07T11:00:00.000Z' };
    expect(shouldNudgeContinueTomorrow(atMark)).toBe(true);
    expect(shouldNudgeContinueTomorrow({ ...late, lessonStartedAt: null })).toBe(true);
  });

  it('reads the numbers from config', () => {
    const config: LearningConfig = { ...LEARNING_CONFIG, sessionMinutes: 30 };
    expect(shouldNudgeContinueTomorrow({ ...base, now: '2026-09-07T10:31:00.000Z' }, config)).toBe(true);
  });
});

describe('earlyAdvance: all concepts competent+ => advance_early offered; one concept developing => not offered', () => {
  const competent = mastery({ conceptId: 'a', band: 'competent' });
  const strong = mastery({ conceptId: 'b', band: 'strong' });
  const developing = mastery({ conceptId: 'c', band: 'developing' });

  it('offers when every concept is competent or better and teach-back is done today', () => {
    expect(earlyAdvanceOffered([competent, strong], true, LEARNING_CONFIG, SESSION)).toBe(true);
    expect(earlyAdvanceOffered([competent, strong, developing], true, LEARNING_CONFIG, SESSION)).toBe(false);
    expect(earlyAdvanceOffered([], true, LEARNING_CONFIG, SESSION)).toBe(false);
  });

  it('without today\'s teach-back it needs teach-back evidence >= 70 from a previous day on every concept', () => {
    const yesterday = mastery({ conceptId: 'a', band: 'competent' }, { teach_back: { score: 75, evidenceCount: 1, lastEvidenceAt: '2026-09-06T22:00:00.000Z' } });
    const today = mastery({ conceptId: 'b', band: 'competent' }, { teach_back: { score: 90, evidenceCount: 1, lastEvidenceAt: '2026-09-07T01:00:00.000Z' } });
    const weak = mastery({ conceptId: 'c', band: 'competent' }, { teach_back: { score: 60, evidenceCount: 2, lastEvidenceAt: '2026-09-01T10:00:00.000Z' } });

    expect(earlyAdvanceOffered([yesterday], false, LEARNING_CONFIG, SESSION)).toBe(true);
    expect(earlyAdvanceOffered([today], false, LEARNING_CONFIG, SESSION)).toBe(false);
    expect(earlyAdvanceOffered([weak], false, LEARNING_CONFIG, SESSION)).toBe(false);
    expect(earlyAdvanceOffered([competent], false, LEARNING_CONFIG, SESSION)).toBe(false);
    expect(earlyAdvanceOffered([yesterday, today], false, LEARNING_CONFIG, SESSION)).toBe(false);
  });

  it('"previous day" is the learner-local calendar day', () => {
    const lateEvening = mastery({ conceptId: 'a', band: 'competent' }, { teach_back: { score: 80, evidenceCount: 1, lastEvidenceAt: '2026-09-07T01:00:00.000Z' } });
    // 01:00Z on the 7th is still the 6th in Los Angeles.
    expect(earlyAdvanceOffered([lateEvening], false, LEARNING_CONFIG, { ...SESSION, timeZone: 'America/Los_Angeles' })).toBe(true);
    expect(earlyAdvanceOffered([lateEvening], false, LEARNING_CONFIG, { ...SESSION, timeZone: 'UTC' })).toBe(false);
  });
});

describe('local date helpers', () => {
  it('addLocalDays is pure calendar arithmetic', () => {
    expect(addLocalDays('2026-03-28', 3)).toBe('2026-03-31');
    expect(addLocalDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addLocalDays('2026-09-07', 0)).toBe('2026-09-07');
  });

  it('localDateOf converts an instant into the learner-local calendar date', () => {
    expect(localDateOf('2026-09-07T01:00:00.000Z', 'UTC')).toBe('2026-09-07');
    expect(localDateOf('2026-09-07T01:00:00.000Z', 'America/Los_Angeles')).toBe('2026-09-06');
    expect(localDateOf('2026-09-07T23:30:00.000Z', 'Asia/Tokyo')).toBe('2026-09-08');
  });
});

describe('challenge_me: depth = bandDepthFloor + 2, fail applies 0.5 penalty factor and routes to caveman step; pass awards lesson_completed only', () => {
  const masteries = [mastery({ conceptId: 'a', band: 'competent' }), mastery({ conceptId: 'b', band: 'mastered' }), mastery({ conceptId: 'c', band: 'lost' })];

  it('builds one question at min(8, floor + 2) plus one explain_why probe per concept', () => {
    const gate = buildChallengeGate(masteries, ENGINE_CONFIG);
    expect(gate.items.map((i) => [i.conceptId, i.questionDepth])).toEqual([
      ['a', 6],
      ['b', 8],
      ['c', 3],
    ]);
    for (const item of gate.items) {
      expect(item.probe.angle).toBe('why');
      expect(item.probe.questionType).toBe('explain_why');
      expect(item.probe.depth).toBeGreaterThanOrEqual(2);
      expect(item.probe.depth).toBeLessThanOrEqual(5);
    }
  });

  it('phase 1 returns the gate; passing every question with no suspicious verdict completes early with lesson_completed only', () => {
    const base: FlexActionInput = {
      action: 'challenge_me',
      lessonId: LESSON_ID,
      stepStates: progressedThrough('technical'),
      masteries,
      teachBackDone: false,
      session: SESSION,
    };
    const phase1 = applyFlexAction(base);
    expect(phase1.action).toBe('challenge_me');
    if (phase1.action !== 'challenge_me' || phase1.phase !== 'gate') throw new Error('expected gate phase');
    expect(phase1.gate.items).toHaveLength(3);

    const pass = applyFlexAction({
      ...base,
      gateResults: masteries.map((m) => ({ conceptId: m.conceptId, questionCorrect: true, probeCorrect: true, probeVerdict: 'calibrated' as const })),
    });
    if (pass.action !== 'challenge_me' || pass.phase !== 'passed') throw new Error('expected passed phase');
    expect(pass.lessonStatus).toBe('completed_early');
    expect(pass.nextAction).toBe('advance_early');
    expect(pass.xpReasons).toEqual(['lesson_completed']);
    expect(pass.flexActionLast).toBe('challenge_me');

    const skipped = pass.stepPatches.filter((s) => s.status === 'skipped');
    expect(skipped.map((s) => s.step).sort()).toEqual(
      ['prediction', 'hands_on', 'teach_back', 'assessment', 'spaced_review', 'real_world_scenario', 'simulation'].sort(),
    );
    for (const s of skipped) {
      expect(s.skipReason).toBe(s.step === 'simulation' ? 'confident' : 'challenge_gate');
      expect(s.completedAt).toBe(NOW);
    }
    expect(pass.stepPatches.some((s) => s.step === 'caveman')).toBe(false);
  });

  it('a wrong answer or a suspicious verdict fails the gate: reinforce at caveman of the failing concept with the 0.5 penalty factor', () => {
    const base: FlexActionInput = {
      action: 'challenge_me',
      lessonId: LESSON_ID,
      stepStates: progressedThrough('technical'),
      masteries,
      teachBackDone: false,
      session: SESSION,
    };
    const wrong = applyFlexAction({
      ...base,
      gateResults: [
        { conceptId: 'a', questionCorrect: true, probeCorrect: true, probeVerdict: 'calibrated' },
        { conceptId: 'b', questionCorrect: false, probeCorrect: true, probeVerdict: 'calibrated' },
        { conceptId: 'c', questionCorrect: true, probeCorrect: true, probeVerdict: 'calibrated' },
      ],
    });
    if (wrong.action !== 'challenge_me' || wrong.phase !== 'failed') throw new Error('expected failed phase');
    expect(wrong.failingConceptId).toBe('b');
    expect(wrong.nextAction).toBe('reinforce');
    expect(wrong.jumpTo).toBe('caveman');
    expect(wrong.penaltyFactor).toBe(0.5);
    expect(wrong.xpReasons).toEqual([]);

    const suspicious = applyFlexAction({
      ...base,
      gateResults: [
        { conceptId: 'a', questionCorrect: true, probeCorrect: true, probeVerdict: 'suspicious' },
        { conceptId: 'b', questionCorrect: true, probeCorrect: true, probeVerdict: null },
        { conceptId: 'c', questionCorrect: true, probeCorrect: true, probeVerdict: null },
      ],
    });
    if (suspicious.action !== 'challenge_me' || suspicious.phase !== 'failed') throw new Error('expected failed phase');
    expect(suspicious.failingConceptId).toBe('a');

    const missing = resolveChallengeGate(buildChallengeGate(masteries, ENGINE_CONFIG), [
      { conceptId: 'a', questionCorrect: true, probeCorrect: true, probeVerdict: null },
    ]);
    expect(missing).toEqual({ passed: false, failingConceptId: 'b' });
  });
});

describe('next_mission with gap marks skipped_with_gap and creates review items for concepts below developing', () => {
  const lost = mastery({ conceptId: 'lost-c', band: 'lost', recentPassedFormKeys: ['q-9'] });
  const familiar = mastery(
    { conceptId: 'familiar-c', band: 'familiar', recentProbeAngles: ['why'] },
    { recall: { score: 55, evidenceCount: 2, maxDepthPassed: 2 }, understanding: { score: 40, evidenceCount: 1, maxDepthPassed: 2 } },
  );
  const developing = mastery({ conceptId: 'dev-c', band: 'developing' });
  const competent = mastery({ conceptId: 'comp-c', band: 'competent' });

  const base: FlexActionInput = {
    action: 'next_mission',
    lessonId: LESSON_ID,
    stepStates: progressedThrough('simulation'),
    masteries: [lost, familiar, developing, competent],
    teachBackDone: false,
    session: SESSION,
  };

  it('asks for confirmation first when the early-advance condition does not hold', () => {
    expect(applyFlexAction(base)).toEqual({ action: 'next_mission', outcome: 'confirm_required', flexActionLast: 'next_mission' });
  });

  it('confirmed: lesson skipped_with_gap, remaining steps skipped (move_on), no XP, review items due tomorrow for band < developing', () => {
    const result = applyFlexAction({ ...base, confirmed: true });
    if (result.action !== 'next_mission' || result.outcome !== 'skipped_with_gap') throw new Error('expected skipped_with_gap');
    expect(result.lessonStatus).toBe('skipped_with_gap');
    expect(result.xpReasons).toEqual([]);
    expect(result.stepPatches.map((s) => s.step).sort()).toEqual(
      ['prediction', 'hands_on', 'teach_back', 'assessment', 'spaced_review', 'real_world_scenario'].sort(),
    );
    for (const s of result.stepPatches) expect(s).toMatchObject({ status: 'skipped', skipReason: 'move_on', completedAt: NOW });

    expect(result.reviewItems.map((r) => r.conceptId)).toEqual(['lost-c', 'familiar-c']);
    for (const item of result.reviewItems) {
      expect(item).toMatchObject({ userId: 'user-1', reason: 'skipped_with_gap', dueOn: TOMORROW, intervalDays: 1, lastOutcome: null, reviewCount: 0, lapses: 0 });
    }
    const lostItem = result.reviewItems[0];
    expect(lostItem.dimension).toBe('understanding');
    expect(lostItem.excludeFormKeys).toEqual(['q-9']);
    expect(lostItem.angle).toBe('why');
    expect(lostItem.questionType).toBe('explain_why');
    expect(lostItem.depth).toBe(2);

    const familiarItem = result.reviewItems[1];
    expect(familiarItem.dimension).toBe('understanding');
    expect(familiarItem.angle).toBe('explain_without_jargon');
    expect(familiarItem.questionType).toBe('teach_back');
  });

  it('gapReviewItems alone yields nothing when every concept is developing or better', () => {
    expect(gapReviewItems([developing, competent], SESSION, ENGINE_CONFIG)).toEqual([]);
  });

  it('unlocks the next mission with completed_early and full completion XP when the early-advance condition holds', () => {
    const result = applyFlexAction({ ...base, masteries: [competent], teachBackDone: true });
    if (result.action !== 'next_mission' || result.outcome !== 'unlock_next') throw new Error('expected unlock_next');
    expect(result.lessonStatus).toBe('completed_early');
    expect(result.xpReasons).toEqual(['lesson_completed']);
    expect(result.stepPatches.every((s) => s.status === 'skipped')).toBe(true);
  });
});

describe('continue and review_weakness', () => {
  it('continue resumes at the current step', () => {
    const result = applyFlexAction({
      action: 'continue',
      lessonId: LESSON_ID,
      stepStates: progressedThrough('caveman'),
      masteries: [],
      teachBackDone: false,
      session: SESSION,
    });
    expect(result).toEqual({ action: 'continue', resumeAt: 'technical', flexActionLast: 'continue' });
  });

  it('review_weakness: due items first, then weakest-dimension items regardless of due date, capped at reviewSessionMax', () => {
    const due = [reviewItem({ id: 'd2', dueOn: '2026-09-06' }), reviewItem({ id: 'd1', dueOn: '2026-09-01' })];
    const weak = [
      { item: reviewItem({ id: 'w1', dueOn: '2026-09-20' }), score: 40 },
      { item: reviewItem({ id: 'w2', dueOn: '2026-09-15' }), score: 20 },
      { item: reviewItem({ id: 'd1', dueOn: '2026-09-01' }), score: 10 },
      { item: reviewItem({ id: 'w3', dueOn: '2026-09-15' }), score: 30 },
      { item: reviewItem({ id: 'w4', dueOn: '2026-09-15' }), score: 35 },
    ];
    expect(reviewWeaknessItems(due, weak).map((i) => i.id)).toEqual(['d1', 'd2', 'w2', 'w3', 'w4']);
    const result = applyFlexAction({
      action: 'review_weakness',
      lessonId: LESSON_ID,
      stepStates: [],
      masteries: [],
      teachBackDone: false,
      session: SESSION,
      dueItems: due,
      weakItems: weak,
    });
    if (result.action !== 'review_weakness') throw new Error('expected review_weakness');
    expect(result.items).toHaveLength(LEARNING_CONFIG.reviewSessionMax);
  });
});

describe('spaced_review step excludes review items already served in warmup', () => {
  it('drops served ids, prefers angles not used in warm-up, caps at spacedReviewMax', () => {
    const candidates = [
      reviewItem({ id: 'r1', angle: 'why' }),
      reviewItem({ id: 'r2', angle: 'what_if' }),
      reviewItem({ id: 'r3', angle: 'why' }),
      reviewItem({ id: 'r4', angle: 'predict' }),
      reviewItem({ id: 'r5', angle: null }),
    ];
    const picked = selectSpacedReviewItems(candidates, ['r2'], ['why']);
    expect(picked.map((i) => i.id)).toEqual(['r4', 'r5', 'r1']);
    expect(picked.some((i) => i.id === 'r2')).toBe(false);
    expect(selectSpacedReviewItems(candidates, ['r1', 'r2', 'r3', 'r4', 'r5'], [])).toEqual([]);
  });
});

describe('STEP_ORDER sanity for session helpers', () => {
  it('progressedThrough fixture is consistent with STEP_ORDER', () => {
    expect(progressedThrough('warmup').map((s) => s.status)).toEqual(['completed', 'available', ...STEP_ORDER.slice(2).map(() => 'locked')]);
  });
});
