import { describe, expect, it } from 'vitest';
import { BANDS } from '../mastery-engine/types.ts';
import { DIFFICULTY_CONFIG, ENGINE_CONFIG, LEARNING_CONFIG, PROBE_CONFIG } from './config.ts';
import { segmentOf } from './step-machine.ts';
import { SEGMENTS, SESSION_STEPS } from './types.ts';

describe('LEARNING_CONFIG', () => {
  it('segment budgets sum to 60 and every SessionStep maps to exactly one segment', () => {
    expect(LEARNING_CONFIG.sessionMinutes).toBe(60);

    const perStepTotal = SESSION_STEPS.reduce((sum, step) => sum + LEARNING_CONFIG.steps[step].budgetMin, 0);
    expect(perStepTotal).toBe(60);

    const perSegmentTotal = SEGMENTS.reduce((sum, segment) => sum + LEARNING_CONFIG.segmentBudgetMin[segment], 0);
    expect(perSegmentTotal).toBe(60);

    for (const segment of SEGMENTS) {
      const stepsInSegment = SESSION_STEPS.filter((step) => segmentOf(step) === segment);
      const budget = stepsInSegment.reduce((sum, step) => sum + LEARNING_CONFIG.steps[step].budgetMin, 0);
      expect(budget, `segment ${segment}`).toBe(LEARNING_CONFIG.segmentBudgetMin[segment]);
    }

    for (const step of SESSION_STEPS) {
      const segment = segmentOf(step);
      expect(SEGMENTS).toContain(segment);
      expect(LEARNING_CONFIG.steps[step].segment).toBe(segment);
    }
  });

  it('mirrors the migration constants: 3h duration clamp and the complete_read_step allow list', () => {
    expect(LEARNING_CONFIG.serverClampMs).toBe(10_800_000);
    expect([...LEARNING_CONFIG.readSteps]).toEqual(['curiosity', 'problem', 'caveman', 'technical', 'simulation']);
    expect([...LEARNING_CONFIG.readStepStatuses]).toEqual(['active', 'completed', 'skipped']);
  });

  it('carries the documented session numbers', () => {
    expect(LEARNING_CONFIG.nudge.segmentOverBudgetFactor).toBe(1.5);
    expect(LEARNING_CONFIG.nudge.maxPerSession).toBe(1);
    expect(LEARNING_CONFIG.earlyAdvanceBand).toBe('competent');
    expect(LEARNING_CONFIG.earlyAdvanceTeachBackMin).toBe(70);
    expect(LEARNING_CONFIG.reviewSessionMax).toBe(5);
    expect(LEARNING_CONFIG.gapReviewBand).toBe('developing');
    expect(LEARNING_CONFIG.reviewDueDays).toBe(1);
    expect(LEARNING_CONFIG.consecutiveFailuresForTargetedReview).toBe(2);
    expect(LEARNING_CONFIG.warmup).toEqual({ reviewMin: 1, reviewMax: 3, bossQuestions: 1 });
  });
});

describe('PROBE_CONFIG', () => {
  it('matches the PROBE_CONFIG table', () => {
    expect(PROBE_CONFIG.bandDepthFloor).toEqual({ lost: 1, familiar: 2, developing: 3, competent: 4, strong: 5, mastered: 7 });
    expect(PROBE_CONFIG.understandingFreshDays).toBe(3);
    expect(PROBE_CONFIG.understandingFreshScore).toBe(70);
    expect(PROBE_CONFIG.maxProbesPerConceptPerDay).toBe(2);
    expect(PROBE_CONFIG.maxProbesPerSession).toBe(6);
    expect(PROBE_CONFIG.probeAngleRepeatWindow).toBe(3);
    expect(PROBE_CONFIG.fastAnswerMs).toBe(5000);
    expect(PROBE_CONFIG.consistencyWindow).toBe(5);
    expect(PROBE_CONFIG.probeDepthAboveFloor).toBe(2);
  });

  it('bandDepthFloor is monotonic across bands', () => {
    const floors = BANDS.map((band) => PROBE_CONFIG.bandDepthFloor[band]);
    for (let i = 1; i < floors.length; i += 1) expect(floors[i]).toBeGreaterThan(floors[i - 1]);
  });
});

describe('DIFFICULTY_CONFIG', () => {
  it('matches the DIFFICULTY_CONFIG table', () => {
    expect(DIFFICULTY_CONFIG.bandDepthWindow).toEqual({
      lost: [1, 2],
      familiar: [2, 3],
      developing: [3, 4],
      competent: [4, 5],
      strong: [5, 7],
      mastered: [7, 8],
    });
    expect(DIFFICULTY_CONFIG.stepUpAfterConsecutiveCorrect).toBe(2);
    expect(DIFFICULTY_CONFIG.stepDownAfterFail).toBe(1);
    expect(DIFFICULTY_CONFIG.challengeJump).toBe(2);
    expect(DIFFICULTY_CONFIG.challengeFailPenaltyFactor).toBe(0.5);
    expect(DIFFICULTY_CONFIG.fallback).toBe('nearest_lower_then_higher');
  });

  it('every band window sits inside the depth scale and starts at the probe floor', () => {
    for (const band of BANDS) {
      const [min, max] = DIFFICULTY_CONFIG.bandDepthWindow[band];
      expect(min).toBeGreaterThanOrEqual(1);
      expect(max).toBeLessThanOrEqual(8);
      expect(min).toBeLessThanOrEqual(max);
      expect(min).toBe(PROBE_CONFIG.bandDepthFloor[band]);
    }
  });
});

describe('ENGINE_CONFIG', () => {
  it('bundles the three tables', () => {
    expect(ENGINE_CONFIG.learning).toBe(LEARNING_CONFIG);
    expect(ENGINE_CONFIG.probe).toBe(PROBE_CONFIG);
    expect(ENGINE_CONFIG.difficulty).toBe(DIFFICULTY_CONFIG);
  });
});
