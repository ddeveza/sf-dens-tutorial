import { describe, expect, it } from 'vitest';
import { BANDS, DIMENSIONS } from '../mastery-engine/types.ts';
import { PROBE_ANGLES } from '../learning-engine/types.ts';
import { SR_CONFIG } from './config.ts';
import { INTERVAL_DAYS } from './types.ts';

describe('SR_CONFIG', () => {
  it('matches the architecture table', () => {
    expect(SR_CONFIG.intervals).toEqual({ fail: 1, struggle: 3, strong: 7, mastered: [21, 30] });
    expect(SR_CONFIG.outcomeThresholds).toEqual({ fail: 40, struggle: 70, strong: 90 });
    expect(SR_CONFIG.masteredBandMin).toBe('strong');
    expect(SR_CONFIG.weakDimensionThreshold).toBe(60);
    expect(SR_CONFIG.warmupReviewMax).toBe(3);
    expect(SR_CONFIG.reviewSessionMax).toBe(5);
    expect(SR_CONFIG.reviewDebtNudge).toBe(5);
    expect(SR_CONFIG.lapseLadderReset).toEqual({ afterLapses: 2, maxIntervalDays: 3 });
    expect(SR_CONFIG.abandonedSessionHours).toBe(12);
    expect(SR_CONFIG.newItemIntervalDays).toBe(1);
    expect(SR_CONFIG.skippedGapBandBelow).toBe('developing');
    expect(SR_CONFIG.bandDepthWindowMin).toEqual({ lost: 1, familiar: 2, developing: 3, competent: 4, strong: 5, mastered: 7 });
    expect(SR_CONFIG.defaultDimension).toBe('understanding');
    expect(SR_CONFIG.firstReviewScorer).toBe('deterministic');
  });

  it('only uses intervals the review_items check constraint accepts', () => {
    const used = [SR_CONFIG.intervals.fail, SR_CONFIG.intervals.struggle, SR_CONFIG.intervals.strong, ...SR_CONFIG.intervals.mastered, SR_CONFIG.lapseLadderReset.maxIntervalDays, SR_CONFIG.newItemIntervalDays];
    for (const days of used) expect(INTERVAL_DAYS).toContain(days);
  });

  it('keeps thresholds ascending and the depth window non-decreasing across bands', () => {
    const { fail, struggle, strong } = SR_CONFIG.outcomeThresholds;
    expect(fail).toBeLessThan(struggle);
    expect(struggle).toBeLessThan(strong);
    expect(SR_CONFIG.intervals.mastered[0]).toBeLessThanOrEqual(SR_CONFIG.intervals.mastered[1]);
    const mins = BANDS.map((b) => SR_CONFIG.bandDepthWindowMin[b]);
    for (let i = 1; i < mins.length; i += 1) expect(mins[i]).toBeGreaterThanOrEqual(mins[i - 1]);
  });

  it('gives every dimension at least one review question type, each present in the type catalog', () => {
    for (const dimension of DIMENSIONS) {
      const types = SR_CONFIG.reviewQuestionTypes[dimension];
      expect(types.length).toBeGreaterThan(0);
      for (const type of types) expect(SR_CONFIG.questionTypes[type]).toBeDefined();
    }
  });

  it('maps every probe angle to question types that its dimension list allows, with valid depth ranges', () => {
    for (const angle of PROBE_ANGLES) {
      const spec = SR_CONFIG.probeAngles[angle];
      expect(spec).toBeDefined();
      expect(spec.questionTypes.length).toBeGreaterThan(0);
      expect(spec.depth.min).toBeLessThanOrEqual(spec.depth.max);
      for (const type of spec.questionTypes) {
        expect(SR_CONFIG.reviewQuestionTypes[spec.dimension]).toContain(type);
        const catalog = SR_CONFIG.questionTypes[type];
        expect(catalog).toBeDefined();
        expect(catalog!.depth.min).toBeLessThanOrEqual(spec.depth.max);
      }
    }
    expect(SR_CONFIG.probeAngles.predict.questionTypes).toEqual(['predict_outcome']);
    expect(SR_CONFIG.questionTypes.predict_outcome?.scorer).toBe('deterministic');
  });

  it('never lists boss, capstone or lab as review question types', () => {
    for (const dimension of DIMENSIONS) {
      expect(SR_CONFIG.reviewQuestionTypes[dimension]).not.toContain('boss');
      expect(SR_CONFIG.reviewQuestionTypes[dimension]).not.toContain('capstone');
      expect(SR_CONFIG.reviewQuestionTypes[dimension]).not.toContain('lab');
    }
  });
});
