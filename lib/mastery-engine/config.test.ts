import { describe, expect, it } from 'vitest';
import { MASTERY_CONFIG } from './config.ts';
import { BANDS, CAP_REASONS, DEPTHS, DIMENSIONS } from './types.ts';
import { QUESTION_TYPES } from '../learning-engine/types.ts';

describe('MASTERY_CONFIG', () => {
  it('dimension weights cover every dimension and sum to 1', () => {
    const sum = DIMENSIONS.reduce((acc, d) => acc + MASTERY_CONFIG.dimensionWeights[d], 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('bands are contiguous, ordered and cover 0-100', () => {
    let expectedMin = 0;
    for (const band of BANDS) {
      const { min, max } = MASTERY_CONFIG.bands[band];
      expect(min).toBe(expectedMin);
      expect(max).toBeGreaterThanOrEqual(min);
      expectedMin = max + 1;
    }
    expect(MASTERY_CONFIG.bands.mastered.max).toBe(100);
  });

  it('maxDelta is keyed by every real QuestionType, including lab, boss and capstone', () => {
    for (const qt of QUESTION_TYPES) {
      expect(MASTERY_CONFIG.maxDelta[qt]).toBeGreaterThan(0);
    }
    expect(Object.keys(MASTERY_CONFIG.maxDelta).sort()).toEqual([...QUESTION_TYPES].sort());
  });

  it('question-type defaults exist for every QuestionType', () => {
    for (const qt of QUESTION_TYPES) {
      const d = MASTERY_CONFIG.questionTypeDefaults[qt];
      expect(DIMENSIONS).toContain(d.dimension);
      expect(DEPTHS).toContain(d.depth);
    }
  });

  it('depthWeight is monotone over depths 1-8 and chainGain covers rungs 0-5', () => {
    let prev = 0;
    for (const depth of DEPTHS) {
      expect(MASTERY_CONFIG.depthWeight[depth]).toBeGreaterThan(prev);
      prev = MASTERY_CONFIG.depthWeight[depth];
    }
    expect(Object.keys(MASTERY_CONFIG.chainGain).map(Number).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(MASTERY_CONFIG.chainGain[0]).toBe(0.5);
    expect(MASTERY_CONFIG.chainGain[1]).toBe(0.75);
    expect(MASTERY_CONFIG.chainGain[2]).toBe(1);
  });

  it('carries the documented scalar values', () => {
    expect(MASTERY_CONFIG.alphaBase).toBe(0.25);
    expect(MASTERY_CONFIG.firstEvidenceCap).toEqual({ deterministic: 50, llm: 85 });
    expect(MASTERY_CONFIG.correctThreshold).toBe(70);
    expect(MASTERY_CONFIG.understandingBands).toEqual({ weak: 50, strong: 70 });
    expect(MASTERY_CONFIG.heldRelease).toEqual({ strong: 1, adequate: 0.5, weak: 0.1 });
    expect(MASTERY_CONFIG.heldExpiryDays).toBe(7);
    expect(MASTERY_CONFIG.recallSaturation).toBe(3);
    expect(MASTERY_CONFIG.identicalFormWindowDays).toBe(30);
    expect(MASTERY_CONFIG.secondaryWeight).toBe(0.5);
    expect(MASTERY_CONFIG.masteredGate).toEqual({
      teachBackMin: 80,
      teachBackDepth: 5,
      appOrDebugDepth: 5,
      optimizeDepth: 6,
      designDepth: 7,
      tradeOffsDepth: 8,
    });
    expect(MASTERY_CONFIG.minEvidence).toEqual({ strong: 6, mastered: 10 });
    expect(MASTERY_CONFIG.earlyAdvanceBand).toBe('competent');
    expect(CAP_REASONS.length).toBe(7);
  });
});
