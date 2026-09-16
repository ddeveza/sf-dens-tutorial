import { describe, expect, it } from 'vitest';
import { MASTERY_CONFIG } from './config.ts';
import { bandAtLeast, bandFor, bandIndex, lowerBand, overallRawOf, recompute } from './caps.ts';
import { stateWith, type DimSpec } from './test-fixtures.ts';
import type { Depth, Dimension } from './types.ts';

const cfg = MASTERY_CONFIG;

function allDims(score: number, depth: Depth, n = 1, overrides: Partial<Record<Dimension, DimSpec>> = {}) {
  const spec: Record<Dimension, DimSpec> = {
    recall: { score, n, depth },
    understanding: { score, n, depth },
    application: { score, n, depth },
    debugging: { score, n, depth },
    architecture: { score, n, depth },
    teach_back: { score, n, depth },
  };
  return { ...spec, ...overrides };
}

describe('bandFor', () => {
  it('maps scores onto the band table boundaries', () => {
    expect(bandFor(0, cfg)).toBe('lost');
    expect(bandFor(39, cfg)).toBe('lost');
    expect(bandFor(40, cfg)).toBe('familiar');
    expect(bandFor(59, cfg)).toBe('familiar');
    expect(bandFor(60, cfg)).toBe('developing');
    expect(bandFor(74, cfg)).toBe('developing');
    expect(bandFor(75, cfg)).toBe('competent');
    expect(bandFor(84, cfg)).toBe('competent');
    expect(bandFor(85, cfg)).toBe('strong');
    expect(bandFor(94, cfg)).toBe('strong');
    expect(bandFor(95, cfg)).toBe('mastered');
    expect(bandFor(100, cfg)).toBe('mastered');
  });

  it('band helpers order bands', () => {
    expect(bandIndex('lost')).toBe(0);
    expect(bandIndex('mastered')).toBe(5);
    expect(lowerBand('mastered')).toBe('strong');
    expect(lowerBand('lost')).toBe('lost');
    expect(bandAtLeast('competent', 'competent')).toBe(true);
    expect(bandAtLeast('developing', 'competent')).toBe(false);
  });
});

describe('overallRaw', () => {
  it('ignores unevidenced dimensions (recall-only 50 => overall 50)', () => {
    const s = stateWith({ recall: { score: 50 } });
    expect(overallRawOf(s, cfg)).toBe(50);
    expect(s.overallRaw).toBe(50);
    expect(s.overall).toBe(50);
    expect(s.band).toBe('familiar');
  });

  it('is 0 with no evidence at all', () => {
    const s = stateWith({});
    expect(s.overallRaw).toBe(0);
    expect(s.band).toBe('lost');
    expect(s.capReason).toBeNull();
  });
});

describe('caps in table order', () => {
  it('recall_only: recall 100 alone => band familiar, overall 59', () => {
    const s = stateWith({ recall: { score: 100 } });
    expect(s.overallRaw).toBe(100);
    expect(s.band).toBe('familiar');
    expect(s.overall).toBe(59);
    expect(s.capReason).toBe('recall_only');
  });

  it('no_understanding: recall 95 + application 95 => developing', () => {
    const s = stateWith({ recall: { score: 95, depth: 2 }, application: { score: 95, depth: 4 } });
    expect(s.band).toBe('developing');
    expect(s.overall).toBe(74);
    expect(s.capReason).toBe('no_understanding');
  });

  it('no_application_or_debugging: understanding 95 + recall 95 => competent', () => {
    const s = stateWith({ recall: { score: 95, depth: 2 }, understanding: { score: 95, depth: 3 } });
    expect(s.band).toBe('competent');
    expect(s.overall).toBe(84);
    expect(s.capReason).toBe('no_application_or_debugging');
  });

  it('no_optimize_evidence: all dims 97 with every maxDepthPassed <= 5 => competent', () => {
    const s = stateWith(allDims(97, 5));
    expect(s.overallRaw).toBe(97);
    expect(s.band).toBe('competent');
    expect(s.overall).toBe(84);
    expect(s.capReason).toBe('no_optimize_evidence');
  });

  it('no_design_evidence: all dims 97 with architecture maxDepthPassed 6 => strong', () => {
    const s = stateWith(allDims(97, 5, 1, { architecture: { score: 97, depth: 6 } }));
    expect(s.band).toBe('strong');
    expect(s.overall).toBe(94);
    expect(s.capReason).toBe('no_design_evidence');
  });

  it('no_design_evidence also needs a depth-8 pass somewhere', () => {
    const s = stateWith(allDims(97, 5, 2, { architecture: { score: 97, n: 2, depth: 7 } }));
    expect(s.band).toBe('strong');
    expect(s.capReason).toBe('no_design_evidence');
  });

  it('mastered_gate: all dims 97, architecture depth 8 passed, teach_back maxDepthPassed 4 => strong', () => {
    const s = stateWith(
      allDims(97, 5, 2, { architecture: { score: 97, n: 2, depth: 8 }, teach_back: { score: 97, n: 2, depth: 4 } }),
    );
    expect(s.band).toBe('strong');
    expect(s.overall).toBe(94);
    expect(s.capReason).toBe('mastered_gate');
  });

  it('mastered_gate also requires teach_back score >= teachBackMin', () => {
    const s = stateWith(
      allDims(100, 5, 2, { architecture: { score: 100, n: 2, depth: 8 }, teach_back: { score: 79, n: 2, depth: 5 } }),
    );
    expect(s.overallRaw).toBe(97);
    expect(s.band).toBe('strong');
    expect(s.capReason).toBe('mastered_gate');
  });

  it('min_evidence: raw strong with 5 pieces of evidence => competent', () => {
    const s = stateWith({
      recall: { score: 90, depth: 2 },
      understanding: { score: 90, depth: 3 },
      application: { score: 90, depth: 6 },
      debugging: { score: 90, depth: 5 },
      teach_back: { score: 90, depth: 5 },
    });
    expect(s.overallRaw).toBe(90);
    expect(s.band).toBe('competent');
    expect(s.overall).toBe(84);
    expect(s.capReason).toBe('min_evidence');
  });

  it('min_evidence: mastered needs 10 pieces of evidence', () => {
    const gate = allDims(97, 5, 1, { architecture: { score: 97, n: 1, depth: 8 } });
    const six = stateWith(gate);
    expect(six.band).toBe('strong');
    expect(six.capReason).toBe('min_evidence');

    const ten = stateWith(allDims(97, 5, 2, { architecture: { score: 97, n: 2, depth: 8 } }));
    expect(ten.band).toBe('mastered');
    expect(ten.overall).toBe(97);
    expect(ten.capReason).toBeNull();
  });

  it('a firing cap whose ceiling is not below the raw band is not binding (capReason null)', () => {
    const s = stateWith({
      recall: { score: 74, n: 5, depth: 2 },
      understanding: { score: 74, n: 3, depth: 3 },
      application: { score: 72, n: 2, depth: 4 },
      teach_back: { score: 85, n: 1, depth: 5 },
    });
    expect(s.band).toBe('competent');
    expect(s.capReason).toBeNull();
  });

  it('recompute returns a new object and never mutates its input', () => {
    const s = stateWith({ recall: { score: 100 } });
    const frozen = { ...s, band: 'mastered' as const, overall: 100, capReason: null };
    const out = recompute(frozen, cfg);
    expect(out).not.toBe(frozen);
    expect(frozen.band).toBe('mastered');
    expect(out.band).toBe('familiar');
  });
});
