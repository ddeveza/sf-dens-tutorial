import { describe, expect, it } from 'vitest';
import { MASTERY_CONFIG } from './config.ts';
import { updateDimension, type DimensionEvidence } from './update-dimension.ts';
import { dim } from './test-fixtures.ts';

const cfg = MASTERY_CONFIG;

function ev(overrides: Partial<DimensionEvidence> = {}): DimensionEvidence {
  return {
    dimension: 'recall',
    target: 100,
    depth: 1,
    questionType: 'mcq',
    scorer: 'deterministic',
    formKey: 'q1',
    secondary: false,
    llm: null,
    context: { chainRung: 2, consecutiveRecallCorrect: 0, recentPassedFormKeys: [] },
    ...overrides,
  };
}

describe('updateDimension', () => {
  it('first evidence uses target x depthWeight capped at firstEvidenceCap', () => {
    const recall = updateDimension(dim(0, 0), ev(), cfg);
    expect(recall.after).toBe(50);
    expect(recall.delta).toBe(50);

    const teachBack = updateDimension(
      dim(0, 0),
      ev({
        dimension: 'teach_back',
        target: 88,
        depth: 5,
        questionType: 'teach_back',
        scorer: 'llm',
        llm: { correctness: 88, masteryDelta: 8 },
      }),
      cfg,
    );
    expect(teachBack.raw).toBeCloseTo(96.8, 5);
    expect(teachBack.after).toBe(85);
  });

  it('later evidence is EMA with alpha max(alphaBase, 1/(n+1))', () => {
    const base = ev({ target: 62, depth: 4 });
    expect(updateDimension(dim(50, 1), base, cfg).delta).toBeCloseTo(6, 5); // alpha .5
    expect(updateDimension(dim(50, 2), base, cfg).delta).toBeCloseTo(4, 5); // alpha .333
    expect(updateDimension(dim(50, 3), base, cfg).delta).toBeCloseTo(3, 5); // alpha .25
    expect(updateDimension(dim(50, 9), base, cfg).delta).toBeCloseTo(3, 5); // alpha floor .25
  });

  it('positive delta clamped to maxDelta[questionType], negative also clamped', () => {
    const up = updateDimension(dim(0, 1), ev({ depth: 4 }), cfg);
    expect(up.raw).toBeCloseTo(50, 5);
    expect(up.delta).toBe(cfg.maxDelta.mcq);
    expect(up.after).toBe(8);

    const down = updateDimension(dim(100, 1), ev({ target: 0, depth: 4 }), cfg);
    expect(down.delta).toBe(-cfg.maxDelta.mcq);
    expect(down.after).toBe(92);

    const llm = updateDimension(
      dim(0, 1),
      ev({
        dimension: 'teach_back',
        depth: 4,
        questionType: 'teach_back',
        scorer: 'llm',
        llm: { correctness: 100, masteryDelta: 5 },
      }),
      cfg,
    );
    expect(llm.delta).toBe(cfg.maxDelta.teach_back);
  });

  it('negative delta applies even for identical form', () => {
    const r = updateDimension(
      dim(80, 2),
      ev({ target: 0, depth: 2, context: { chainRung: 2, consecutiveRecallCorrect: 0, recentPassedFormKeys: ['q1'] } }),
      cfg,
    );
    expect(r.delta).toBe(-cfg.maxDelta.mcq);
    expect(r.after).toBe(72);
    expect(r.suppressed).toBeNull();
  });

  it('identical form within the window adds zero positive delta', () => {
    const r = updateDimension(
      dim(20, 1),
      ev({ context: { chainRung: 2, consecutiveRecallCorrect: 0, recentPassedFormKeys: ['q1'] } }),
      cfg,
    );
    expect(r.delta).toBe(0);
    expect(r.after).toBe(20);
    expect(r.suppressed).toBe('identical_form');
  });

  it('recall saturation zeroes positive recall deltas at recallSaturation consecutive correct answers', () => {
    const saturated = updateDimension(
      dim(20, 1),
      ev({ context: { chainRung: 2, consecutiveRecallCorrect: cfg.recallSaturation, recentPassedFormKeys: [] } }),
      cfg,
    );
    expect(saturated.delta).toBe(0);
    expect(saturated.suppressed).toBe('recall_saturated');

    const notYet = updateDimension(
      dim(20, 1),
      ev({ context: { chainRung: 2, consecutiveRecallCorrect: cfg.recallSaturation - 1, recentPassedFormKeys: [] } }),
      cfg,
    );
    expect(notYet.delta).toBeGreaterThan(0);

    const otherDimension = updateDimension(
      dim(20, 1),
      ev({
        dimension: 'understanding',
        questionType: 'order_execution',
        depth: 2,
        context: { chainRung: 2, consecutiveRecallCorrect: cfg.recallSaturation, recentPassedFormKeys: [] },
      }),
      cfg,
    );
    expect(otherDimension.delta).toBeGreaterThan(0);
  });

  it('chainGain halves deterministic gains while chainRung < 2 and never touches llm or negative deltas', () => {
    const at = (chainRung: 0 | 1 | 2) => ({ chainRung, consecutiveRecallCorrect: 0, recentPassedFormKeys: [] });
    const base = ev({ target: 12, depth: 4 }); // alpha .5 x dw 1 x (12 - 0) = 6 before chainGain
    expect(updateDimension(dim(0, 1), { ...base, context: at(0) }, cfg).delta).toBeCloseTo(3, 5);
    expect(updateDimension(dim(0, 1), { ...base, context: at(1) }, cfg).delta).toBeCloseTo(4.5, 5);
    expect(updateDimension(dim(0, 1), { ...base, context: at(2) }, cfg).delta).toBeCloseTo(6, 5);

    const llm = ev({
      dimension: 'understanding',
      target: 12,
      depth: 4,
      questionType: 'explain_why',
      scorer: 'llm',
      llm: { correctness: 90, masteryDelta: 2 },
      context: at(0),
    });
    expect(updateDimension(dim(0, 1), llm, cfg).delta).toBeCloseTo(6, 5);

    const negative = updateDimension(dim(50, 1), { ...ev({ target: 38, depth: 4 }), context: at(0) }, cfg);
    expect(negative.delta).toBeCloseTo(-6, 5);
  });

  it('sign gate: llm masteryDelta <= 0 blocks positive deltas but not negative ones', () => {
    const llm = (masteryDelta: number, target: number, score: number) =>
      updateDimension(
        dim(score, 1),
        ev({
          dimension: 'understanding',
          target,
          depth: 3,
          questionType: 'explain_why',
          scorer: 'llm',
          llm: { correctness: 90, masteryDelta },
        }),
        cfg,
      );
    expect(llm(0, 100, 40).delta).toBe(0);
    expect(llm(0, 100, 40).suppressed).toBe('sign_gate');
    expect(llm(-3, 100, 40).delta).toBe(0);
    expect(llm(1, 100, 40).delta).toBeGreaterThan(0);
    expect(llm(-3, 0, 60).delta).toBeLessThan(0);
  });

  it('correctness floor: llm correctness below correctThreshold zeroes positive deltas, negatives still apply', () => {
    const r = updateDimension(
      dim(0, 1),
      ev({
        dimension: 'understanding',
        target: 69,
        depth: 3,
        questionType: 'explain_why',
        scorer: 'llm',
        llm: { correctness: 69, masteryDelta: 4 },
      }),
      cfg,
    );
    expect(r.delta).toBe(0);
    expect(r.suppressed).toBe('correctness_floor');

    const first = updateDimension(dim(0, 0), { ...ev({ dimension: 'application', target: 40, depth: 3, questionType: 'explain_why', scorer: 'llm', llm: { correctness: 40, masteryDelta: -2 } }) }, cfg);
    expect(first.after).toBe(0);

    const down = updateDimension(
      dim(80, 2),
      ev({
        dimension: 'understanding',
        target: 20,
        depth: 3,
        questionType: 'explain_why',
        scorer: 'llm',
        llm: { correctness: 20, masteryDelta: -4 },
      }),
      cfg,
    );
    expect(down.delta).toBeLessThan(0);
  });

  it('secondary evidence multiplies gain by secondaryWeight (worked example B numbers)', () => {
    const understanding = updateDimension(
      dim(72, 3),
      ev({
        dimension: 'understanding',
        target: 85,
        depth: 5,
        questionType: 'teach_back',
        scorer: 'llm',
        secondary: true,
        llm: { correctness: 88, masteryDelta: 8 },
        formKey: 'tb1',
      }),
      cfg,
    );
    expect(understanding.delta).toBeCloseTo(1.7875, 4);
    expect(understanding.after).toBe(74);

    const application = updateDimension(
      dim(70, 2),
      ev({
        dimension: 'application',
        target: 80,
        depth: 5,
        questionType: 'teach_back',
        scorer: 'llm',
        secondary: true,
        llm: { correctness: 88, masteryDelta: 8 },
        formKey: 'tb1',
      }),
      cfg,
    );
    expect(application.delta).toBeCloseTo(1.8333, 3);
    expect(application.after).toBe(72);
  });

  it('scores stay integers within 0-100', () => {
    const top = updateDimension(dim(99, 1), ev({ depth: 4 }), cfg);
    expect(top.after).toBe(100);
    const bottom = updateDimension(dim(1, 1), ev({ target: 0, depth: 4 }), cfg);
    expect(bottom.after).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(bottom.after)).toBe(true);
    const floor = updateDimension({ ...dim(0, 1), score: 0 }, ev({ target: 0, depth: 4 }), cfg);
    expect(floor.after).toBe(0);
  });
});
