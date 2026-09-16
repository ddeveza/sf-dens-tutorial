// ARCHITECTURE.md "Learning Engine and Mastery Model" section 8, reproduced numerically.
import { describe, expect, it } from 'vitest';
import { applyEvaluation } from './apply-evaluation.ts';
import { applyEvidence } from './apply-evidence.ts';
import { MASTERY_CONFIG } from './config.ts';
import { createMasteryState } from './state.ts';
import { CONCEPT, NOW, USER, evaluation, llmEvidence, mcq, stateWith } from './test-fixtures.ts';

const cfg = MASTERY_CONFIG;

describe('worked example A: five correct MCQs, failed explain-why', () => {
  it('reproduces recall 21 / understanding 20 / overall 13 / lost', () => {
    // 1. MCQ depth 1 correct in 4 s, self-confidence 5; shouldProbe => held
    const step1 = applyEvidence({
      state: createMasteryState(USER, CONCEPT, NOW),
      evidence: mcq({ attemptId: 'a1', formKey: 'q1', selfConfidence: 5, durationMs: 4_000 }),
      config: cfg,
      now: NOW,
      hold: true,
    });
    expect(step1.held?.delta).toBe(50);
    expect(step1.state.dims.recall.score).toBe(0);
    expect(step1.state.consecutiveRecallCorrect).toBe(1);
    expect(step1.state.overall).toBe(0);
    expect(step1.state.band).toBe('lost');

    // 2. Probe why: suspicious, held released x0.1, understanding first evidence 30 x .65
    const step2 = applyEvaluation({
      mastery: step1.state,
      evaluation: evaluation({ correctness: 72, understanding: 30, application: 25, architecture: 10, confidence: 35, masteryDelta: 1, nextAction: 'continue' }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: {
        selfConfidence: null,
        isProbeAfterCorrect: true,
        evidence: llmEvidence({ attemptId: 'a2', formKey: 'probe-why', dimension: 'understanding', depth: 2, probeAngle: 'why', chainRung: 1 }),
      },
    });
    expect(step2.verdict).toBe('suspicious');
    expect(step2.nextAction).toBe('probe');
    expect(step2.state.dims.recall.score).toBe(5);
    expect(step2.state.dims.understanding.score).toBe(20);
    expect(step2.state.dims.application.evidenceCount).toBe(0);
    expect(step2.state.chainRung).toBe(0);
    expect(step2.state.consecutiveRecallCorrect).toBe(1);
    expect(step2.state.band).toBe('lost');

    // 3. Mandatory probe what_if (application, depth 3) fails: positive deltas discarded, application evidenced at 0
    const step3 = applyEvaluation({
      mastery: step2.state,
      evaluation: evaluation({ correctness: 40, understanding: 35, application: 30, architecture: 10, confidence: 30, masteryDelta: -2, nextAction: 'reinforce' }),
      questionType: 'explain_why',
      now: NOW,
      config: cfg,
      attempt: {
        selfConfidence: null,
        isProbeAfterCorrect: false,
        evidence: llmEvidence({ attemptId: 'a3', formKey: 'probe-what-if', dimension: 'application', depth: 3, probeAngle: 'what_if', chainRung: 2 }),
      },
    });
    expect(step3.state.dims.recall.score).toBe(5);
    expect(step3.state.dims.understanding.score).toBe(20);
    expect(step3.state.dims.application).toEqual({ score: 0, evidenceCount: 1, maxDepthPassed: 0, lastEvidenceAt: NOW });
    expect(step3.state.consecutiveRecallCorrect).toBe(1);
    expect(step3.state.chainRung).toBe(0);
    expect(step3.state.overall).toBe(10);
    expect(step3.state.band).toBe('lost');
    expect(step3.state.recentProbeAngles).toEqual(['why', 'what_if']);

    // 4. MCQ depth 1: .5 x .5 x chainGain .5 x (100 - 5) = 11.9 -> clamp 8
    const step4 = applyEvidence({ state: step3.state, evidence: mcq({ attemptId: 'a4', formKey: 'q2' }), config: cfg, now: NOW });
    expect(step4.appliedDelta).toBe(8);
    expect(step4.state.dims.recall.score).toBe(13);
    expect(step4.state.consecutiveRecallCorrect).toBe(2);

    // 5. MCQ depth 2: .333 x .65 x .5 x 87 = 9.4 -> 8
    const step5 = applyEvidence({ state: step4.state, evidence: mcq({ attemptId: 'a5', formKey: 'q3', depth: 2 }), config: cfg, now: NOW });
    expect(step5.appliedDelta).toBe(8);
    expect(step5.state.dims.recall.score).toBe(21);
    expect(step5.state.consecutiveRecallCorrect).toBe(3);
    expect(step5.state.overall).toBe(13);

    // 6-7. MCQ #4 and #5 correct: recall saturated => delta 0 (#5 is also the same form as #1)
    const step6 = applyEvidence({ state: step5.state, evidence: mcq({ attemptId: 'a6', formKey: 'q4' }), config: cfg, now: NOW });
    expect(step6.appliedDelta).toBe(0);
    const step7 = applyEvidence({ state: step6.state, evidence: mcq({ attemptId: 'a7', formKey: 'q1' }), config: cfg, now: NOW });
    expect(step7.appliedDelta).toBe(0);

    const final = step7.state;
    expect(final.dims.recall.score).toBe(21);
    expect(final.dims.understanding.score).toBe(20);
    expect(final.dims.application.score).toBe(0);
    expect(final.overallRaw).toBe(13);
    expect(final.overall).toBe(13);
    expect(final.band).toBe('lost');
    expect(final.capReason).toBeNull();
    expect(final.dims.recall.evidenceCount).toBe(5);
  });

  it('even with saturation disabled, recall_only caps the concept at 59', () => {
    const noSaturation = { ...cfg, recallSaturation: Number.POSITIVE_INFINITY };
    let state = createMasteryState(USER, CONCEPT, NOW);
    for (let i = 0; i < 12; i += 1) {
      state = applyEvidence({
        state,
        evidence: mcq({ attemptId: `m${i}`, formKey: `m${i}`, depth: i % 2 === 0 ? 1 : 2 }),
        config: noSaturation,
        now: NOW,
      }).state;
    }
    expect(state.dims.recall.score).toBeGreaterThan(59);
    expect(state.overall).toBe(59);
    expect(state.band).toBe('familiar');
    expect(state.capReason).toBe('recall_only');
  });
});

describe('worked example B: passing teach-back', () => {
  const before = stateWith(
    {
      recall: { score: 74, n: 5, depth: 2 },
      understanding: { score: 72, n: 3, depth: 3 },
      application: { score: 70, n: 2, depth: 4 },
    },
    { chainRung: 3 },
  );

  it('starts at overall 72, developing', () => {
    expect(before.overallRaw).toBe(72);
    expect(before.overall).toBe(72);
    expect(before.band).toBe('developing');
    expect(before.capReason).toBeNull();
  });

  it('reproduces overall 76 / competent / capReason null', () => {
    const out = applyEvaluation({
      mastery: before,
      evaluation: evaluation({
        correctness: 88,
        understanding: 85,
        application: 80,
        architecture: 60,
        confidence: 82,
        masteryDelta: 8,
        misconceptions: [],
        nextAction: 'continue',
        feedback: '...',
      }),
      questionType: 'teach_back',
      now: NOW,
      config: cfg,
      attempt: {
        selfConfidence: null,
        isProbeAfterCorrect: false,
        evidence: llmEvidence({
          attemptId: 'tb-1',
          questionType: 'teach_back',
          formKey: 'tb1',
          dimension: 'teach_back',
          depth: 5,
          probeAngle: 'explain_to_junior',
          chainRung: 5,
        }),
      },
    });
    expect(out.state.dims.teach_back).toEqual({ score: 85, evidenceCount: 1, maxDepthPassed: 5, lastEvidenceAt: NOW });
    expect(out.state.dims.understanding.score).toBe(74);
    expect(out.state.dims.application.score).toBe(72);
    expect(out.state.dims.architecture).toEqual({ score: 0, evidenceCount: 0, maxDepthPassed: 0, lastEvidenceAt: null });
    expect(out.state.chainRung).toBe(5);
    expect(out.verdict).toBe('calibrated');
    expect(out.flags).toEqual([]);
    expect(out.appliedDelta).toBe(89);
    expect(out.state.overallRaw).toBe(76);
    expect(out.state.overall).toBe(76);
    expect(out.state.band).toBe('competent');
    expect(out.state.capReason).toBeNull();
    expect(out.nextAction).toBe('continue');
  });

  it('with understanding 45 the verdict is suspicious and the next action is probe', () => {
    const out = applyEvaluation({
      mastery: before,
      evaluation: evaluation({ correctness: 88, understanding: 45, application: 80, architecture: 60, confidence: 82, masteryDelta: 8 }),
      questionType: 'teach_back',
      now: NOW,
      config: cfg,
      attempt: {
        selfConfidence: null,
        isProbeAfterCorrect: false,
        evidence: llmEvidence({ questionType: 'teach_back', formKey: 'tb1', dimension: 'teach_back', depth: 5, probeAngle: 'explain_to_junior', chainRung: 5 }),
      },
    });
    expect(out.verdict).toBe('suspicious');
    expect(out.nextAction).toBe('probe');
    expect(out.state.chainRung).toBe(3);
  });
});
