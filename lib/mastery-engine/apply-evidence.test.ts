import { describe, expect, it } from 'vitest';
import { applyEvidence } from './apply-evidence.ts';
import { MASTERY_CONFIG } from './config.ts';
import { holdCredit } from './held.ts';
import { createMasteryState } from './state.ts';
import { addDays } from './time.ts';
import { CONCEPT, NOW, USER, llmEvidence, mcq, stateWith } from './test-fixtures.ts';
import type { MasteryState } from './types.ts';

const cfg = MASTERY_CONFIG;

describe('applyEvidence (deterministic)', () => {
  it('credits a correct first answer immediately and records the evidence', () => {
    const fresh = createMasteryState(USER, CONCEPT, NOW);
    const out = applyEvidence({ state: fresh, evidence: mcq(), config: cfg, now: NOW });
    expect(out.state.dims.recall).toEqual({ score: 50, evidenceCount: 1, maxDepthPassed: 1, lastEvidenceAt: NOW });
    expect(out.updates).toEqual([{ dimension: 'recall', before: 0, after: 50, delta: 50 }]);
    expect(out.appliedDelta).toBe(50);
    expect(out.held).toBeUndefined();
    expect(out.state.consecutiveRecallCorrect).toBe(1);
    expect(out.state.recentPassedFormKeys).toEqual(['q1']);
    expect(out.state.recentPassedFormKeyAt).toEqual({ q1: NOW });
    expect(out.state.band).toBe('familiar');
    expect(out.state.capReason).toBeNull(); // recall_only's ceiling (familiar) does not bind below the raw band
    expect(out.state.updatedAt).toBe(NOW);
    expect(out.verdict).toBe('unknown');
    // input untouched
    expect(fresh.dims.recall.score).toBe(0);
    expect(fresh.recentPassedFormKeys).toEqual([]);
  });

  it('holds a positive delta while a probe is pending (worked example A step 1)', () => {
    const fresh = createMasteryState(USER, CONCEPT, NOW);
    const out = applyEvidence({
      state: fresh,
      evidence: mcq({ selfConfidence: 5, durationMs: 4_000 }),
      config: cfg,
      now: NOW,
      hold: true,
    });
    expect(out.held).toEqual({ attemptId: 'a-mcq', dimension: 'recall', delta: 50, expiresAt: addDays(NOW, cfg.heldExpiryDays) });
    expect(out.state.held).toEqual([out.held]);
    expect(out.state.dims.recall).toEqual({ score: 0, evidenceCount: 1, maxDepthPassed: 1, lastEvidenceAt: NOW });
    expect(out.updates).toEqual([]);
    expect(out.appliedDelta).toBe(0);
    expect(out.state.consecutiveRecallCorrect).toBe(1);
    expect(out.state.overall).toBe(0);
    expect(out.state.band).toBe('lost');
  });

  it('never holds a non-positive delta: a wrong answer applies at full weight even with hold requested', () => {
    const s = stateWith({ recall: { score: 50, n: 1, depth: 1 } }, { consecutiveRecallCorrect: 2, recentPassedFormKeys: ['q1'], recentPassedFormKeyAt: { q1: NOW } });
    const out = applyEvidence({ state: s, evidence: mcq({ formKey: 'q1', score: 0, correct: false }), config: cfg, now: NOW, hold: true });
    expect(out.held).toBeUndefined();
    expect(out.state.dims.recall.score).toBe(42); // .5 x .5 x (0 - 50) = -12.5 -> clamp -8
    expect(out.state.dims.recall.evidenceCount).toBe(2);
    expect(out.state.dims.recall.maxDepthPassed).toBe(1);
    expect(out.state.consecutiveRecallCorrect).toBe(0);
    expect(out.updates).toEqual([{ dimension: 'recall', before: 50, after: 42, delta: -8 }]);
    expect(out.appliedDelta).toBe(-8);
  });

  it('recall saturation: 4th consecutive correct recall adds zero; resets after correct non-recall evidence or a wrong recall answer', () => {
    let s: MasteryState = { ...createMasteryState(USER, CONCEPT, NOW), chainRung: 2 };
    const answer = (formKey: string, at = NOW) => {
      const out = applyEvidence({ state: s, evidence: mcq({ attemptId: formKey, formKey, at }), config: cfg, now: at });
      s = out.state;
      return out;
    };
    expect(answer('q1').appliedDelta).toBe(50);
    expect(answer('q2').appliedDelta).toBe(8);
    expect(answer('q3').appliedDelta).toBe(7);
    expect(s.consecutiveRecallCorrect).toBe(3);
    expect(answer('q4').appliedDelta).toBe(0);
    expect(s.dims.recall.score).toBe(65);
    expect(s.dims.recall.evidenceCount).toBe(4);
    expect(s.consecutiveRecallCorrect).toBe(4);

    const predict = applyEvidence({
      state: s,
      evidence: mcq({ attemptId: 'p1', formKey: 'p1', questionType: 'predict_outcome', dimension: 'application', depth: 3 }),
      config: cfg,
      now: NOW,
    });
    s = predict.state;
    expect(s.dims.application.score).toBe(cfg.firstEvidenceCap.deterministic); // 100 x .8 = 80 -> capped 50
    expect(s.consecutiveRecallCorrect).toBe(0);
    expect(answer('q5').appliedDelta).toBeGreaterThan(0);
    expect(s.consecutiveRecallCorrect).toBe(1);

    const saturatedAgain: MasteryState = { ...s, consecutiveRecallCorrect: 4 };
    const wrong = applyEvidence({ state: saturatedAgain, evidence: mcq({ formKey: 'q6', score: 0, correct: false }), config: cfg, now: NOW });
    expect(wrong.state.consecutiveRecallCorrect).toBe(0);

    const failedPredict = applyEvidence({
      state: saturatedAgain,
      evidence: mcq({ formKey: 'p2', questionType: 'predict_outcome', dimension: 'application', depth: 3, score: 0, correct: false }),
      config: cfg,
      now: NOW,
    });
    expect(failedPredict.state.consecutiveRecallCorrect).toBe(4);
  });

  it('identical form within identicalFormWindowDays adds zero; outside the window it counts again', () => {
    const inside = addDays(NOW, -(cfg.identicalFormWindowDays - 1));
    const outside = addDays(NOW, -(cfg.identicalFormWindowDays + 1));
    const base = stateWith({ recall: { score: 20, n: 1, depth: 1 } }, { chainRung: 2 });

    const blocked = applyEvidence({
      state: { ...base, recentPassedFormKeys: ['q1'], recentPassedFormKeyAt: { q1: inside } },
      evidence: mcq({ formKey: 'q1' }),
      config: cfg,
      now: NOW,
    });
    expect(blocked.appliedDelta).toBe(0);
    expect(blocked.state.dims.recall.evidenceCount).toBe(2);
    expect(blocked.state.recentPassedFormKeyAt.q1).toBe(NOW);

    const allowed = applyEvidence({
      state: { ...base, recentPassedFormKeys: ['q1'], recentPassedFormKeyAt: { q1: outside } },
      evidence: mcq({ formKey: 'q1' }),
      config: cfg,
      now: NOW,
    });
    expect(allowed.appliedDelta).toBeGreaterThan(0);

    const legacy = applyEvidence({
      state: { ...base, recentPassedFormKeys: ['q1'], recentPassedFormKeyAt: {} },
      evidence: mcq({ formKey: 'q1' }),
      config: cfg,
      now: NOW,
    });
    expect(legacy.appliedDelta).toBe(0); // no timestamp: conservative, treated as inside the window
  });

  it('keeps only the last recentFormKeysMax passed form keys and prunes their timestamps', () => {
    const keys = Array.from({ length: cfg.recentFormKeysMax }, (_, i) => `k${i}`);
    const at = Object.fromEntries(keys.map((k) => [k, NOW]));
    const s = stateWith({ recall: { score: 20, n: 1, depth: 1 } }, { recentPassedFormKeys: keys, recentPassedFormKeyAt: at });
    const out = applyEvidence({ state: s, evidence: mcq({ formKey: 'fresh' }), config: cfg, now: NOW });
    expect(out.state.recentPassedFormKeys).toHaveLength(cfg.recentFormKeysMax);
    expect(out.state.recentPassedFormKeys.at(-1)).toBe('fresh');
    expect(out.state.recentPassedFormKeys).not.toContain('k0');
    expect(out.state.recentPassedFormKeyAt.k0).toBeUndefined();
    expect(out.state.recentPassedFormKeyAt.fresh).toBe(NOW);
  });

  it('passes a chain rung on correct evidence only and never lowers it', () => {
    const fresh = createMasteryState(USER, CONCEPT, NOW);
    const passed = applyEvidence({
      state: fresh,
      evidence: mcq({ questionType: 'predict_outcome', dimension: 'application', depth: 3, chainRung: 2 }),
      config: cfg,
      now: NOW,
    });
    expect(passed.state.chainRung).toBe(2);

    const failed = applyEvidence({
      state: fresh,
      evidence: mcq({ questionType: 'predict_outcome', dimension: 'application', depth: 3, chainRung: 2, score: 0, correct: false }),
      config: cfg,
      now: NOW,
    });
    expect(failed.state.chainRung).toBe(0);

    const lower = applyEvidence({ state: { ...fresh, chainRung: 3 }, evidence: mcq({ chainRung: 1 }), config: cfg, now: NOW });
    expect(lower.state.chainRung).toBe(3);
  });

  it('records the probe angle, bounded by recentProbeAnglesMax', () => {
    const s = stateWith({}, { recentProbeAngles: ['why', 'what_if', 'what_breaks'], lastProbeAngle: 'what_breaks' });
    const out = applyEvidence({
      state: s,
      evidence: mcq({ questionType: 'predict_outcome', dimension: 'application', depth: 3, probeAngle: 'predict' }),
      config: cfg,
      now: NOW,
    });
    expect(out.state.lastProbeAngle).toBe('predict');
    expect(out.state.recentProbeAngles).toEqual(['what_if', 'what_breaks', 'predict']);
  });

  it('drops expired held credit on entry', () => {
    const s = holdCredit(createMasteryState(USER, CONCEPT, NOW), { attemptId: 'old', dimension: 'recall', delta: 50, expiresAt: NOW });
    const out = applyEvidence({ state: s, evidence: mcq(), config: cfg, now: NOW });
    expect(out.state.held).toEqual([]);
  });

  it('routes self-confidence into the verdict without touching scores', () => {
    const fresh = createMasteryState(USER, CONCEPT, NOW);
    const over = applyEvidence({ state: fresh, evidence: mcq({ score: 0, correct: false, selfConfidence: 5 }), config: cfg, now: NOW });
    expect(over.verdict).toBe('overconfident');
    const under = applyEvidence({ state: fresh, evidence: mcq({ selfConfidence: 1 }), config: cfg, now: NOW });
    expect(under.verdict).toBe('underconfident');
    expect(under.state.dims.recall.score).toBe(50);
  });

  it('rejects llm-scored evidence (that path is applyEvaluation)', () => {
    const fresh = createMasteryState(USER, CONCEPT, NOW);
    expect(() => applyEvidence({ state: fresh, evidence: llmEvidence(), config: cfg, now: NOW })).toThrow(/applyEvaluation/);
  });
});
