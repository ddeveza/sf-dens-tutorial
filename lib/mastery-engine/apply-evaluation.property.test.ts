// Hand-rolled property test over a grid of evaluations (no fast-check dependency).
import { describe, expect, it } from 'vitest';
import { applyEvaluation, type ApplyEvaluationResult } from './apply-evaluation.ts';
import { MASTERY_CONFIG } from './config.ts';
import { NOW, evaluation, llmEvidence, stateWith } from './test-fixtures.ts';
import { DIMENSIONS, type Depth, type Dimension } from './types.ts';
import type { QuestionType } from '../learning-engine/types.ts';

const cfg = MASTERY_CONFIG;

const LLM_TYPES: Array<{ questionType: QuestionType; dimension: Dimension; depth: Depth }> = [
  { questionType: 'explain_why', dimension: 'understanding', depth: 3 },
  { questionType: 'compare_approaches', dimension: 'architecture', depth: 5 },
  { questionType: 'architecture_decision', dimension: 'architecture', depth: 6 },
  { questionType: 'fix_design', dimension: 'architecture', depth: 6 },
  { questionType: 'scenario_diagnosis', dimension: 'debugging', depth: 5 },
  { questionType: 'teach_back', dimension: 'teach_back', depth: 4 },
  { questionType: 'boss', dimension: 'debugging', depth: 7 },
  { questionType: 'capstone', dimension: 'architecture', depth: 8 },
];

const CORRECTNESS = [0, 69, 70, 85, 100];
const UNDERSTANDING = [0, 49, 50, 69, 70, 100];
const SUB = [0, 55, 100];
const POSITIVE_MD = [1, 5, 10];
const NON_POSITIVE_MD = [-10, -1, 0];

// Every dimension already evidenced (n = 2, score 50) so the maxDelta clamp, not the first-evidence cap, is the rule.
function evidencedState() {
  return stateWith({
    recall: { score: 50, n: 2, depth: 2 },
    understanding: { score: 50, n: 2, depth: 3 },
    application: { score: 50, n: 2, depth: 3 },
    debugging: { score: 50, n: 2, depth: 3 },
    architecture: { score: 50, n: 2, depth: 3 },
    teach_back: { score: 50, n: 2, depth: 3 },
  });
}

function stripVerdict(r: ApplyEvaluationResult) {
  return { updates: r.updates, appliedDelta: r.appliedDelta, dims: r.state.dims };
}

describe('applyEvaluation property: delta bounds and masteryDelta independence', () => {
  it('holds over the whole grid', () => {
    const base = evidencedState();
    let runs = 0;
    for (const { questionType, dimension, depth } of LLM_TYPES) {
      const evidence = llmEvidence({ questionType, dimension, depth, formKey: `${questionType}-form` });
      for (const correctness of CORRECTNESS) {
        for (const understanding of UNDERSTANDING) {
          for (const application of SUB) {
            for (const architecture of SUB) {
              const run = (masteryDelta: number) =>
                applyEvaluation({
                  mastery: base,
                  evaluation: evaluation({ correctness, understanding, application, architecture, masteryDelta }),
                  questionType,
                  now: NOW,
                  config: cfg,
                  attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence },
                });
              const positives = POSITIVE_MD.map(run);
              const nonPositives = NON_POSITIVE_MD.map(run);
              for (const r of [...positives, ...nonPositives]) {
                runs += 1;
                const primary = r.updates.find((u) => u.dimension === dimension);
                const primaryDelta = primary ? primary.delta : Number.POSITIVE_INFINITY;
                expect(Math.abs(primaryDelta)).toBeLessThanOrEqual(cfg.maxDelta[questionType]);
                for (const u of r.updates) {
                  expect(Math.abs(u.delta)).toBeLessThanOrEqual(cfg.maxDelta[questionType]);
                  expect(u.after - u.before).toBe(u.delta);
                }
                expect(r.appliedDelta).toBe(r.updates.reduce((acc, u) => acc + u.delta, 0));
                for (const d of DIMENSIONS) {
                  const score = r.state.dims[d].score;
                  expect(Number.isInteger(score)).toBe(true);
                  expect(score).toBeGreaterThanOrEqual(0);
                  expect(score).toBeLessThanOrEqual(100);
                }
                expect(r.state.dims[dimension].evidenceCount).toBe(3);
              }
              // magnitude independence: any positive masteryDelta gives the same result, any non-positive the same result
              for (const r of positives.slice(1)) expect(stripVerdict(r)).toEqual(stripVerdict(positives[0]));
              for (const r of nonPositives.slice(1)) expect(stripVerdict(r)).toEqual(stripVerdict(nonPositives[0]));
              // a non-positive masteryDelta never yields more credit than a positive one
              expect(nonPositives[0].appliedDelta).toBeLessThanOrEqual(positives[0].appliedDelta);
              for (const u of nonPositives[0].updates) expect(u.delta).toBeLessThanOrEqual(0);
            }
          }
        }
      }
    }
    expect(runs).toBe(LLM_TYPES.length * CORRECTNESS.length * UNDERSTANDING.length * SUB.length * SUB.length * 6);
  }, 60_000);

  it('first evidence is bounded by firstEvidenceCap.llm regardless of maxDelta', () => {
    const fresh = stateWith({});
    for (const { questionType, dimension, depth } of LLM_TYPES) {
      const r = applyEvaluation({
        mastery: fresh,
        evaluation: evaluation({ correctness: 100, understanding: 100, application: 100, architecture: 100, masteryDelta: 10 }),
        questionType,
        now: NOW,
        config: cfg,
        attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: llmEvidence({ questionType, dimension, depth }) },
      });
      expect(r.state.dims[dimension].score).toBeLessThanOrEqual(cfg.firstEvidenceCap.llm);
      expect(r.updates).toHaveLength(1); // secondary never creates evidence
    }
  });
});
