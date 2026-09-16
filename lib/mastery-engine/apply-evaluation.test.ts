import { describe, expect, it } from 'vitest';
import { applyEvaluation } from './apply-evaluation.ts';
import { MASTERY_CONFIG } from './config.ts';
import { holdCredit } from './held.ts';
import { rubricToEvaluation } from './rubric.ts';
import { createMasteryState } from './state.ts';
import { addDays } from './time.ts';
import { CONCEPT, NOW, USER, evaluation, llmEvidence, stateWith } from './test-fixtures.ts';
import type { LlmNextAction } from '../learning-engine/types.ts';
import type { BossRubric } from '../llm/schemas.ts';

const cfg = MASTERY_CONFIG;

function bState(now = NOW) {
  return stateWith(
    {
      recall: { score: 74, n: 5, depth: 2 },
      understanding: { score: 72, n: 3, depth: 3 },
      application: { score: 70, n: 2, depth: 4 },
    },
    { chainRung: 3 },
    now,
  );
}

const teachBackEvidence = () =>
  llmEvidence({
    attemptId: 'tb-1',
    questionType: 'teach_back',
    formKey: 'tb1',
    dimension: 'teach_back',
    depth: 5,
    probeAngle: 'explain_to_junior',
    chainRung: 5,
  });

describe('applyEvaluation', () => {
  it('masteryDelta <= 0 blocks positive primary delta (sign gate)', () => {
    const s = stateWith({ understanding: { score: 40, n: 1, depth: 2 } });
    const evidence = llmEvidence({ depth: 3 });
    const blocked = applyEvaluation({
      mastery: s,
      evaluation: evaluation({ correctness: 90, understanding: 90, masteryDelta: 0 }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence },
    });
    expect(blocked.state.dims.understanding.score).toBe(40);
    expect(blocked.appliedDelta).toBe(0);
    expect(blocked.state.dims.understanding.evidenceCount).toBe(2);

    const allowed = applyEvaluation({
      mastery: s,
      evaluation: evaluation({ correctness: 90, understanding: 90, masteryDelta: 1 }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence },
    });
    expect(allowed.state.dims.understanding.score).toBeGreaterThan(40);
  });

  it('correctness below 70 discards positive deltas but records evidenceCount', () => {
    const out = applyEvaluation({
      mastery: createMasteryState(USER, CONCEPT, NOW),
      evaluation: evaluation({ correctness: 40, understanding: 35, application: 30, architecture: 10, masteryDelta: 2 }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: llmEvidence({ depth: 3 }) },
    });
    expect(out.state.dims.understanding).toEqual({ score: 0, evidenceCount: 1, maxDepthPassed: 0, lastEvidenceAt: NOW });
    expect(out.updates).toEqual([{ dimension: 'understanding', before: 0, after: 0, delta: 0 }]);
    expect(out.appliedDelta).toBe(0);
    expect(out.flags).toEqual([]);
  });

  it('secondary scores never create evidence in unevidenced dimensions', () => {
    const out = applyEvaluation({
      mastery: createMasteryState(USER, CONCEPT, NOW),
      evaluation: evaluation({ correctness: 88, understanding: 85, application: 80, architecture: 60, masteryDelta: 8 }),
      questionType: 'teach_back',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: teachBackEvidence() },
    });
    expect(out.state.dims.teach_back.score).toBe(85);
    for (const d of ['understanding', 'application', 'architecture'] as const) {
      expect(out.state.dims[d]).toEqual({ score: 0, evidenceCount: 0, maxDepthPassed: 0, lastEvidenceAt: null });
    }
    expect(out.updates).toEqual([{ dimension: 'teach_back', before: 0, after: 85, delta: 85 }]);
  });

  it('secondary scores move evidenced dimensions without touching their evidenceCount or maxDepthPassed', () => {
    const out = applyEvaluation({
      mastery: bState(),
      evaluation: evaluation({ correctness: 88, understanding: 85, application: 80, architecture: 60, masteryDelta: 8 }),
      questionType: 'teach_back',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: teachBackEvidence() },
    });
    expect(out.state.dims.understanding).toEqual({ score: 74, evidenceCount: 3, maxDepthPassed: 3, lastEvidenceAt: NOW });
    expect(out.state.dims.application).toEqual({ score: 72, evidenceCount: 2, maxDepthPassed: 4, lastEvidenceAt: NOW });
    expect(out.state.dims.architecture.evidenceCount).toBe(0);
    expect(out.appliedDelta).toBe(85 + 2 + 2);
    expect(out.updates).toEqual([
      { dimension: 'teach_back', before: 0, after: 85, delta: 85 },
      { dimension: 'understanding', before: 72, after: 74, delta: 2 },
      { dimension: 'application', before: 70, after: 72, delta: 2 },
    ]);
  });

  it('nextAction outside LLM_NEXT_ACTIONS (hand-built evaluation) is ignored', () => {
    const out = applyEvaluation({
      mastery: bState(),
      evaluation: evaluation({ nextAction: 'advance' as unknown as LlmNextAction }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: llmEvidence() },
    });
    expect(out.nextAction).toBe('continue');
  });

  it('honours challenge only at band >= developing, otherwise downgrades to continue', () => {
    const lost = applyEvaluation({
      mastery: createMasteryState(USER, CONCEPT, NOW),
      evaluation: evaluation({ nextAction: 'challenge' }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: llmEvidence() },
    });
    expect(lost.state.band).toBe('familiar'); // one explain_why: 80 x .65 = 52, still below developing
    expect(lost.nextAction).toBe('continue');

    const developing = applyEvaluation({
      mastery: bState(),
      evaluation: evaluation({ nextAction: 'challenge' }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: llmEvidence() },
    });
    expect(developing.nextAction).toBe('challenge');

    const reinforce = applyEvaluation({
      mastery: bState(),
      evaluation: evaluation({ nextAction: 'targeted_review' }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: llmEvidence() },
    });
    expect(reinforce.nextAction).toBe('targeted_review');
  });

  it('misconception ids appended and deduped into weakAreas; null ids ignored; unknown ids dropped when the concept declares its list', () => {
    const s = { ...bState(), weakAreas: ['m1'] };
    const misconceptions = [
      { id: 'm1', summary: 'Repeats m1' },
      { id: 'm2', summary: 'New m2' },
      { id: null, summary: 'Unclassified' },
      { id: 'm2', summary: 'm2 again' },
    ];
    const out = applyEvaluation({
      mastery: s,
      evaluation: evaluation({ misconceptions }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: llmEvidence() },
    });
    expect(out.misconceptionIds).toEqual(['m1', 'm2']);
    expect(out.state.weakAreas).toEqual(['m1', 'm2']);

    const filtered = applyEvaluation({
      mastery: s,
      evaluation: evaluation({ misconceptions }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: llmEvidence() },
      conceptMisconceptionIds: ['m1'],
    });
    expect(filtered.misconceptionIds).toEqual(['m1']);
    expect(filtered.state.weakAreas).toEqual(['m1']);
  });

  it('suspicious probe after a correct answer: held released x0.1, understanding toward the low score, nextAction probe, rung not passed', () => {
    const held = holdCredit(
      { ...stateWith({ recall: { score: 0, n: 1, depth: 1 } }), consecutiveRecallCorrect: 1 },
      { attemptId: 'a1', dimension: 'recall', delta: 50, expiresAt: addDays(NOW, cfg.heldExpiryDays) },
    );
    const out = applyEvaluation({
      mastery: held,
      evaluation: evaluation({ correctness: 72, understanding: 30, application: 25, architecture: 10, confidence: 35, masteryDelta: 1, nextAction: 'continue' }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: {
        selfConfidence: null,
        isProbeAfterCorrect: true,
        evidence: llmEvidence({ attemptId: 'a2', formKey: 'probe-why', depth: 2, probeAngle: 'why', chainRung: 1 }),
      },
    });
    expect(out.verdict).toBe('suspicious');
    expect(out.flags).toEqual(['suspicious']);
    expect(out.nextAction).toBe('probe');
    expect(out.state.dims.recall.score).toBe(5);
    expect(out.state.dims.understanding).toEqual({ score: 20, evidenceCount: 1, maxDepthPassed: 2, lastEvidenceAt: NOW });
    expect(out.state.dims.application.evidenceCount).toBe(0);
    expect(out.state.held).toEqual([]);
    expect(out.state.chainRung).toBe(0);
    expect(out.state.consecutiveRecallCorrect).toBe(1);
    expect(out.state.lastProbeAngle).toBe('why');
    expect(out.state.recentProbeAngles).toEqual(['why']);
    expect(out.appliedDelta).toBe(25);
    expect(out.updates).toEqual([
      { dimension: 'recall', before: 0, after: 5, delta: 5 },
      { dimension: 'understanding', before: 0, after: 20, delta: 20 },
    ]);
  });

  it('a probe after a correct answer is suspicious even when the probe itself fails', () => {
    const out = applyEvaluation({
      mastery: stateWith({ recall: { score: 50, n: 1, depth: 1 } }),
      evaluation: evaluation({ correctness: 40, understanding: 30, masteryDelta: -2 }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: true, evidence: llmEvidence({ probeAngle: 'why', chainRung: 1 }) },
    });
    expect(out.verdict).toBe('suspicious');
    expect(out.nextAction).toBe('probe');
  });

  it('suspicious verdict on a non-understanding primary withholds its positive credit (example B variant)', () => {
    const out = applyEvaluation({
      mastery: bState(),
      evaluation: evaluation({ correctness: 88, understanding: 45, application: 80, architecture: 60, confidence: 82, masteryDelta: 8 }),
      questionType: 'teach_back',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: teachBackEvidence() },
    });
    expect(out.verdict).toBe('suspicious');
    expect(out.nextAction).toBe('probe');
    expect(out.state.dims.teach_back).toEqual({ score: 0, evidenceCount: 1, maxDepthPassed: 5, lastEvidenceAt: NOW });
    expect(out.state.dims.understanding.score).toBe(68); // .25 x 1.1 x .5 x (45 - 72) = -3.7
    expect(out.state.chainRung).toBe(3);
    expect(out.updates.find((u) => u.dimension === 'teach_back')).toEqual({ dimension: 'teach_back', before: 0, after: 0, delta: 0 });
  });

  it('strong understanding releases held credit in full and clears the suspicion; adequate releases half', () => {
    const held = holdCredit(stateWith({ recall: { score: 0, n: 1, depth: 1 } }), {
      attemptId: 'a1',
      dimension: 'recall',
      delta: 50,
      expiresAt: addDays(NOW, cfg.heldExpiryDays),
    });
    const strong = applyEvaluation({
      mastery: held,
      evaluation: evaluation({ correctness: 85, understanding: 80, masteryDelta: 3 }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: true, evidence: llmEvidence({ probeAngle: 'why', chainRung: 1 }) },
    });
    expect(strong.verdict).toBe('calibrated');
    expect(strong.flags).toEqual([]);
    expect(strong.state.dims.recall.score).toBe(50);
    expect(strong.state.held).toEqual([]);
    expect(strong.state.chainRung).toBe(1);
    expect(strong.nextAction).toBe('continue');

    const adequate = applyEvaluation({
      mastery: held,
      evaluation: evaluation({ correctness: 75, understanding: 60, masteryDelta: 2 }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: true, evidence: llmEvidence({ probeAngle: 'why', chainRung: 1 }) },
    });
    expect(adequate.state.dims.recall.score).toBe(25);
  });

  it('overconfidence: self_confidence >= 4 with correctness < 70 flags without score effect', () => {
    const out = applyEvaluation({
      mastery: bState(),
      evaluation: evaluation({ correctness: 40, understanding: 60, application: 50, architecture: 30, masteryDelta: -3 }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: 5, isProbeAfterCorrect: false, evidence: llmEvidence({ selfConfidence: 5 }) },
    });
    expect(out.verdict).toBe('overconfident');
    expect(out.flags).toEqual(['overconfident']);
    expect(out.nextAction).toBe('continue');
  });

  it('underconfidence is a verdict, never a flag', () => {
    const out = applyEvaluation({
      mastery: bState(),
      evaluation: evaluation({ correctness: 85, understanding: 80, masteryDelta: 2 }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: { selfConfidence: 2, isProbeAfterCorrect: false, evidence: llmEvidence() },
    });
    expect(out.verdict).toBe('underconfident');
    expect(out.flags).toEqual([]);
  });

  it('recall counter: correct non-suspicious non-recall evidence resets it; failed or suspicious evidence leaves it', () => {
    const s = { ...bState(), consecutiveRecallCorrect: 2 };
    const evidence = llmEvidence();
    const correct = applyEvaluation({ mastery: s, evaluation: evaluation({ correctness: 85, understanding: 80 }), questionType: 'explain_why', now: NOW, config: cfg, attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence } });
    expect(correct.state.consecutiveRecallCorrect).toBe(0);
    const failed = applyEvaluation({ mastery: s, evaluation: evaluation({ correctness: 40, understanding: 60 }), questionType: 'explain_why', now: NOW, config: cfg, attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence } });
    expect(failed.state.consecutiveRecallCorrect).toBe(2);
    const suspicious = applyEvaluation({ mastery: s, evaluation: evaluation({ correctness: 85, understanding: 30 }), questionType: 'explain_why', now: NOW, config: cfg, attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence } });
    expect(suspicious.state.consecutiveRecallCorrect).toBe(2);
  });

  it('without an attempt, routes by the question type defaults', () => {
    const out = applyEvaluation({
      mastery: createMasteryState(USER, CONCEPT, NOW),
      evaluation: evaluation({ correctness: 88, understanding: 85, application: 80, architecture: 60, masteryDelta: 8 }),
      questionType: 'teach_back',
      now: NOW,
      config: cfg,
    });
    const depth = cfg.questionTypeDefaults.teach_back.depth;
    expect(out.state.dims.teach_back.score).toBe(Math.round(88 * cfg.depthWeight[depth]));
    expect(out.state.dims.teach_back.maxDepthPassed).toBe(depth);
    expect(out.state.recentPassedFormKeys).toEqual([]);
    expect(out.verdict).toBe('calibrated');
  });

  it('applies a converted boss rubric to the debugging dimension with its own maxDelta', () => {
    const rubric: BossRubric = {
      suspect: 80,
      why: 70,
      dataNeeded: 90,
      whatToInspect: 80,
      solution: 75,
      tradeOffs: 65,
      overall: 0,
      misconceptions: [{ id: 'boss-m1', summary: 'x' }],
      strengths: [],
      gaps: [],
      feedback: 'f',
    };
    const s = stateWith({ debugging: { score: 60, n: 2, depth: 5 }, understanding: { score: 70, n: 2, depth: 3 } });
    const out = applyEvaluation({
      mastery: s,
      evaluation: rubricToEvaluation(rubric, cfg),
      questionType: 'boss',
      now: NOW,
      config: cfg,
      attempt: {
        selfConfidence: null,
        isProbeAfterCorrect: false,
        evidence: llmEvidence({ questionType: 'boss', formKey: 'boss-w1', dimension: 'debugging', depth: 7 }),
      },
    });
    // n=2 -> alpha .333 x dw 1.3 x (85 - 60) = 10.8
    expect(out.state.dims.debugging.score).toBe(71);
    expect(out.state.dims.debugging.maxDepthPassed).toBe(7);
    expect(out.misconceptionIds).toEqual(['boss-m1']);
    expect(out.state.weakAreas).toEqual(['boss-m1']);
  });

  it('appliedDelta equals the sum of update deltas and never mutates the input', () => {
    const s = bState();
    const snapshot = JSON.parse(JSON.stringify(s));
    const out = applyEvaluation({
      mastery: s,
      evaluation: evaluation({ correctness: 88, understanding: 85, application: 80, architecture: 60, masteryDelta: 8 }),
      questionType: 'teach_back',
      now: '2026-09-08T09:00:00.000Z',
      config: cfg,
      attempt: { selfConfidence: null, isProbeAfterCorrect: false, evidence: teachBackEvidence() },
    });
    expect(out.appliedDelta).toBe(out.updates.reduce((acc, u) => acc + u.delta, 0));
    expect(s).toEqual(snapshot);
    expect(out.state.updatedAt).toBe('2026-09-08T09:00:00.000Z');
    expect(out.state.dims.teach_back.lastEvidenceAt).toBe(NOW); // evidence.at, not now
  });
});
