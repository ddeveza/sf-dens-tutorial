import { describe, expect, it } from 'vitest';
import { SR_CONFIG } from './config.ts';
import { bandAtLeast, evidenceReviewScore, outcomeFor, reviewScore, sessionOutcome, type ReviewEvidence } from './outcome.ts';

const det = (score: number): ReviewEvidence => ({ scorer: 'deterministic', score });
const llm = (correctness: number, understanding: number): ReviewEvidence => ({
  scorer: 'llm',
  score: correctness,
  evaluation: { correctness, understanding },
});

describe('outcome thresholds', () => {
  it('39 fail, 40 struggle, 69 struggle, 70 strong, 90 strong when band competent, 90 mastered when band strong', () => {
    expect(outcomeFor(39, 'competent')).toBe('fail');
    expect(outcomeFor(40, 'competent')).toBe('struggle');
    expect(outcomeFor(69, 'competent')).toBe('struggle');
    expect(outcomeFor(70, 'competent')).toBe('strong');
    expect(outcomeFor(89, 'strong')).toBe('strong');
    expect(outcomeFor(90, 'competent')).toBe('strong');
    expect(outcomeFor(90, 'strong')).toBe('mastered');
    expect(outcomeFor(100, 'mastered')).toBe('mastered');
  });

  it('band below strong can never produce mastered, and fail ignores band', () => {
    expect(outcomeFor(100, 'lost')).toBe('strong');
    expect(outcomeFor(100, 'developing')).toBe('strong');
    expect(outcomeFor(0, 'mastered')).toBe('fail');
    expect(outcomeFor(39.9, 'mastered')).toBe('fail');
  });

  it('reads the thresholds and the mastered band gate from config', () => {
    const config = {
      ...SR_CONFIG,
      outcomeThresholds: { fail: 50, struggle: 75, strong: 95 },
      masteredBandMin: 'competent' as const,
    };
    expect(outcomeFor(49, 'strong', config)).toBe('fail');
    expect(outcomeFor(74, 'strong', config)).toBe('struggle');
    expect(outcomeFor(94, 'strong', config)).toBe('strong');
    expect(outcomeFor(95, 'competent', config)).toBe('mastered');
  });

  it('rejects a non-finite score', () => {
    expect(() => outcomeFor(Number.NaN, 'strong')).toThrow(TypeError);
  });
});

describe('bandAtLeast', () => {
  it('orders bands lost < familiar < developing < competent < strong < mastered', () => {
    expect(bandAtLeast('strong', 'strong')).toBe(true);
    expect(bandAtLeast('mastered', 'strong')).toBe(true);
    expect(bandAtLeast('competent', 'strong')).toBe(false);
    expect(bandAtLeast('lost', 'familiar')).toBe(false);
  });
});

describe('session review score', () => {
  it('uses min(correctness, understanding) for LLM evidence and ignores deterministic scores when LLM evidence exists', () => {
    expect(evidenceReviewScore(llm(88, 85))).toBe(85);
    expect(evidenceReviewScore(llm(60, 95))).toBe(60);
    expect(reviewScore([det(100), det(100), llm(72, 30)])).toBe(30);
  });

  it('reproduces worked example A: mean(min(72,30), min(40,35)) = 32.5 => fail', () => {
    const evidence = [det(100), det(100), det(100), llm(72, 30), llm(40, 35)];
    expect(reviewScore(evidence)).toBe(32.5);
    expect(sessionOutcome(evidence, 'lost')).toBe('fail');
  });

  it('reproduces worked example B: min(88, 85) = 85 => strong', () => {
    expect(reviewScore([llm(88, 85)])).toBe(85);
    expect(sessionOutcome([llm(88, 85)], 'competent')).toBe('strong');
  });

  it('falls back to the mean of deterministic scores without LLM evidence', () => {
    expect(reviewScore([det(100), det(0), det(50)])).toBe(50);
    expect(evidenceReviewScore(det(42))).toBe(42);
    expect(sessionOutcome([det(100), det(80)], 'strong')).toBe('mastered');
  });

  it('skips LLM evidence with no parsed evaluation (pending) and returns null without any usable evidence', () => {
    const pending: ReviewEvidence = { scorer: 'llm', score: 0, evaluation: null };
    expect(evidenceReviewScore(pending)).toBeNull();
    expect(reviewScore([pending, det(80)])).toBe(80);
    expect(reviewScore([pending])).toBeNull();
    expect(reviewScore([])).toBeNull();
    expect(sessionOutcome([], 'strong')).toBeNull();
  });
});
