import { describe, expect, it } from 'vitest';
import { MASTERY_CONFIG } from './config.ts';
import { confidenceVerdict, type ConfidenceSources } from './confidence.ts';

const cfg = MASTERY_CONFIG;

function sources(overrides: Partial<ConfidenceSources> = {}): ConfidenceSources {
  return { correct: true, selfConfidence: null, llm: null, consistency: null, ...overrides };
}

describe('confidenceVerdict', () => {
  it('self 5 + wrong => overconfident', () => {
    expect(confidenceVerdict(sources({ correct: false, selfConfidence: 5 }), cfg)).toBe('overconfident');
    expect(confidenceVerdict(sources({ correct: false, selfConfidence: 4 }), cfg)).toBe('overconfident');
    expect(confidenceVerdict(sources({ correct: false, selfConfidence: 3 }), cfg)).toBe('calibrated');
  });

  it('correct + understanding 30 => suspicious', () => {
    expect(confidenceVerdict(sources({ llm: { understanding: 30, confidence: 80 } }), cfg)).toBe('suspicious');
  });

  it('correct + llm confidence below 40 => suspicious', () => {
    expect(confidenceVerdict(sources({ llm: { understanding: 80, confidence: 35 } }), cfg)).toBe('suspicious');
  });

  it('wrong answer with weak understanding is not suspicious', () => {
    expect(confidenceVerdict(sources({ correct: false, llm: { understanding: 30, confidence: 30 } }), cfg)).toBe('calibrated');
  });

  it('self 2 + correct + understanding 80 => underconfident', () => {
    expect(confidenceVerdict(sources({ selfConfidence: 2, llm: { understanding: 80, confidence: 70 } }), cfg)).toBe('underconfident');
    expect(confidenceVerdict(sources({ selfConfidence: 1 }), cfg)).toBe('underconfident'); // no LLM data
    expect(confidenceVerdict(sources({ selfConfidence: 2, llm: { understanding: 60, confidence: 70 } }), cfg)).toBe('calibrated');
  });

  it('precedence: suspicious > overconfident > underconfident > calibrated', () => {
    expect(confidenceVerdict(sources({ selfConfidence: 2, llm: { understanding: 30, confidence: 80 } }), cfg)).toBe('suspicious');
    expect(
      confidenceVerdict(
        sources({
          correct: false,
          selfConfidence: 5,
          llm: { understanding: 80, confidence: 80 },
          consistency: { recentCorrectDeterministic: 3, understandingScore: 30, chainRung: 0, probesSoFar: 1 },
        }),
        cfg,
      ),
    ).toBe('suspicious');
    expect(confidenceVerdict(sources({ selfConfidence: 3 }), cfg)).toBe('calibrated');
  });

  it('consistency source: >= 3 correct deterministic with weak understanding or an unpassed chain after a probe', () => {
    expect(
      confidenceVerdict(
        sources({ consistency: { recentCorrectDeterministic: 3, understandingScore: 40, chainRung: 2, probesSoFar: 0 } }),
        cfg,
      ),
    ).toBe('suspicious');
    expect(
      confidenceVerdict(
        sources({ consistency: { recentCorrectDeterministic: 3, understandingScore: 80, chainRung: 0, probesSoFar: 1 } }),
        cfg,
      ),
    ).toBe('suspicious');
    expect(
      confidenceVerdict(
        sources({ consistency: { recentCorrectDeterministic: 3, understandingScore: 80, chainRung: 0, probesSoFar: 0 } }),
        cfg,
      ),
    ).toBe('calibrated');
    expect(
      confidenceVerdict(
        sources({ consistency: { recentCorrectDeterministic: 2, understandingScore: 40, chainRung: 0, probesSoFar: 1 } }),
        cfg,
      ),
    ).toBe('calibrated');
    expect(
      confidenceVerdict(
        sources({ consistency: { recentCorrectDeterministic: 3, understandingScore: null, chainRung: 1, probesSoFar: 1 } }),
        cfg,
      ),
    ).toBe('calibrated');
  });

  it('unknown when no source applies', () => {
    expect(confidenceVerdict(sources(), cfg)).toBe('unknown');
    expect(confidenceVerdict(sources({ correct: false }), cfg)).toBe('unknown');
  });
});
