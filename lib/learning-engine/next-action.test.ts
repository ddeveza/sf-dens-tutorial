import { describe, expect, it } from 'vitest';
import { PROBE_CONFIG } from './config.ts';
import { selectNextAction, type NextActionContext } from './next-action.ts';
import { evidence, mastery, NOW, TODAY, TOMORROW } from './test-fixtures.ts';

const templates = { probes: { why: ['t'], what_if: ['t'], predict: ['t'], explain_without_jargon: ['t'] } };

function context(over: Partial<NextActionContext> = {}): NextActionContext {
  return {
    mastery: mastery({ band: 'developing' }),
    evidence: evidence({ depth: 3 }),
    verdict: null,
    previousVerdict: null,
    evaluation: { status: 'evaluated', llmNextAction: null },
    llmQuotaAvailable: true,
    probes: { probesToday: 0, probesThisSession: 0 },
    consecutiveFailures: 0,
    concept: templates,
    earlyAdvance: false,
    session: { userId: 'user-1', now: NOW, todayLocal: TODAY, elapsedMs: 10 * 60_000, atStepBoundary: true },
    ...over,
  };
}

const capped = { probesToday: PROBE_CONFIG.maxProbesPerConceptPerDay, probesThisSession: 0 };

describe('selectNextAction precedence: retry_later > probe > reinforce > targeted_review > advance_early > end_session > llm nextAction > continue', () => {
  it('walks the ladder as each higher rule is removed', () => {
    // Everything at once: quota exceeded + suspicious + wrong answer x2 + early advance + long session + LLM challenge.
    const everything = context({
      evaluation: { status: 'quota_exceeded', llmNextAction: 'challenge' },
      verdict: 'suspicious',
      evidence: evidence({ depth: 3, correct: false, score: 0 }),
      consecutiveFailures: 2,
      earlyAdvance: true,
      session: { userId: 'user-1', now: NOW, todayLocal: TODAY, elapsedMs: 61 * 60_000, atStepBoundary: true },
    });
    expect(selectNextAction(everything)).toMatchObject({ action: 'retry_later', rule: 1 });

    const pendingInstead = context({ ...everything, evaluation: { status: 'pending_evaluation', llmNextAction: 'challenge' } });
    expect(selectNextAction(pendingInstead)).toMatchObject({ action: 'retry_later', rule: 1 });

    // Rule 1 gone: a suspicious verdict with probes remaining => probe at a different angle.
    const suspiciousCorrect = context({
      ...everything,
      evaluation: { status: 'evaluated', llmNextAction: 'challenge' },
      verdict: 'suspicious',
      evidence: evidence({ scorer: 'llm', questionType: 'explain_why', dimension: 'understanding', depth: 2, score: 72, probeAngle: 'why', chainRung: 1 }),
      mastery: mastery({ band: 'developing', recentProbeAngles: ['why'] }),
      consecutiveFailures: 0,
    });
    const probe = selectNextAction(suspiciousCorrect);
    expect(probe).toMatchObject({ action: 'probe', rule: 2 });
    expect(probe.probe?.angle).not.toBe('why');

    // Rule 2 gone (caps reached): suspicious with no probes remaining => reinforce.
    expect(selectNextAction({ ...suspiciousCorrect, probes: capped })).toMatchObject({ action: 'reinforce', rule: 3 });

    // Rule 3 gone: a wrong answer, second in a row => targeted_review.
    const secondFail = context({
      ...everything,
      evaluation: { status: 'evaluated', llmNextAction: 'challenge' },
      verdict: 'overconfident',
      consecutiveFailures: 2,
    });
    expect(selectNextAction(secondFail)).toMatchObject({ action: 'targeted_review', rule: 4 });

    // Rule 4 gone: correct answer, no probe wanted (fresh understanding), early advance => advance_early.
    const fresh = mastery({ band: 'developing' }, { understanding: { score: 80, evidenceCount: 2, lastEvidenceAt: NOW } });
    const advance = context({
      ...secondFail,
      mastery: fresh,
      evidence: evidence({ depth: 3 }),
      verdict: 'calibrated',
      consecutiveFailures: 0,
    });
    expect(selectNextAction(advance)).toMatchObject({ action: 'advance_early', rule: 5 });

    // Rule 5 gone: session over 60 minutes at a boundary => end_session.
    expect(selectNextAction({ ...advance, earlyAdvance: false })).toMatchObject({ action: 'end_session', rule: 6 });

    // Rule 6 gone: LLM challenge honoured (band developing).
    const shortSession = { userId: 'user-1', now: NOW, todayLocal: TODAY, elapsedMs: 20 * 60_000, atStepBoundary: true };
    expect(selectNextAction({ ...advance, earlyAdvance: false, session: shortSession })).toMatchObject({ action: 'challenge', rule: 7 });

    // Rule 7 gone: continue.
    expect(
      selectNextAction({ ...advance, earlyAdvance: false, session: shortSession, evaluation: { status: 'evaluated', llmNextAction: null } }),
    ).toMatchObject({ action: 'continue', rule: 8 });
  });

  it('end_session needs a step boundary; a long session mid-step continues', () => {
    const fresh = mastery({ band: 'developing' }, { understanding: { score: 80, evidenceCount: 2, lastEvidenceAt: NOW } });
    const midStep = context({
      mastery: fresh,
      session: { userId: 'user-1', now: NOW, todayLocal: TODAY, elapsedMs: 90 * 60_000, atStepBoundary: false },
    });
    expect(selectNextAction(midStep)).toMatchObject({ action: 'continue', rule: 8 });
  });

  it('shouldProbe alone (correct deterministic answer at the floor, no understanding evidence) yields probe with an angle', () => {
    const decision = selectNextAction(context());
    expect(decision).toMatchObject({ action: 'probe', rule: 2 });
    expect(decision.probe).toMatchObject({ angle: 'why', questionType: 'explain_why', dimension: 'understanding' });
    expect(decision.reviewItem).toBeNull();
  });

  it('without LLM quota the probe falls back to the deterministic predict angle, or is skipped when the concept has none', () => {
    const noQuota = selectNextAction(context({ llmQuotaAvailable: false }));
    expect(noQuota).toMatchObject({ action: 'probe', rule: 2 });
    expect(noQuota.probe?.angle).toBe('predict');

    const noPredict = selectNextAction(context({ llmQuotaAvailable: false, concept: { probes: { why: ['t'] } } }));
    expect(noPredict).toMatchObject({ action: 'continue', rule: 8 });
  });

  it('a suspicious verdict whose mandatory follow-up has no eligible angle reinforces', () => {
    const state = mastery({ band: 'developing', recentProbeAngles: ['why'] });
    const decision = selectNextAction(context({ mastery: state, verdict: 'suspicious', concept: { probes: { why: ['t'] } } }));
    expect(decision).toMatchObject({ action: 'reinforce', rule: 3 });
    expect(decision.reinforce).toMatchObject({ step: 'caveman', depth: 2 });
  });

  it('a lingering suspicious verdict from an earlier attempt forces the probe on the next correct answer', () => {
    const decision = selectNextAction(context({ mastery: mastery({ band: 'competent' }), evidence: evidence({ depth: 1 }), previousVerdict: 'suspicious' }));
    expect(decision).toMatchObject({ action: 'probe', rule: 2 });
  });
});

describe('selectNextAction: overconfident wrong answer routes to reinforce, never probe; challenge honoured only at band >= developing', () => {
  it('first wrong answer with self-confidence 5 => reinforce at depth - 1, never probe', () => {
    const decision = selectNextAction(
      context({
        evidence: evidence({ depth: 3, correct: false, score: 0, selfConfidence: 5, durationMs: 3_000 }),
        verdict: 'overconfident',
        consecutiveFailures: 1,
        evaluation: { status: 'evaluated', llmNextAction: 'probe' },
      }),
    );
    expect(decision).toMatchObject({ action: 'reinforce', rule: 4 });
    expect(decision.probe).toBeNull();
    expect(decision.reinforce).toEqual({ step: 'caveman', depth: 2 });
  });

  it('reinforce depth never drops below 1', () => {
    const decision = selectNextAction(
      context({ evidence: evidence({ depth: 1, correct: false, score: 0 }), consecutiveFailures: 1, mastery: mastery({ band: 'lost' }) }),
    );
    expect(decision.reinforce).toEqual({ step: 'caveman', depth: 1 });
  });

  it('LLM challenge is honoured at developing and above, downgraded to continue below', () => {
    const fresh = (band: 'familiar' | 'developing' | 'strong') =>
      mastery({ band }, { understanding: { score: 80, evidenceCount: 2, lastEvidenceAt: NOW } });
    const withChallenge = (band: 'familiar' | 'developing' | 'strong') =>
      context({ mastery: fresh(band), evidence: evidence({ depth: 8 }), evaluation: { status: 'evaluated', llmNextAction: 'challenge' } });
    expect(selectNextAction(withChallenge('familiar'))).toMatchObject({ action: 'continue', rule: 7 });
    expect(selectNextAction(withChallenge('developing'))).toMatchObject({ action: 'challenge', rule: 7 });
    expect(selectNextAction(withChallenge('strong'))).toMatchObject({ action: 'challenge', rule: 7 });
  });

  it('LLM reinforce / targeted_review / probe / continue are honoured at rule 7 with their payloads', () => {
    const fresh = mastery({ band: 'developing' }, { understanding: { score: 80, evidenceCount: 2, lastEvidenceAt: NOW } });
    const base = context({ mastery: fresh });
    expect(selectNextAction({ ...base, evaluation: { status: 'evaluated', llmNextAction: 'reinforce' } })).toMatchObject({
      action: 'reinforce',
      rule: 7,
      reinforce: { step: 'caveman', depth: 2 },
    });
    const review = selectNextAction({ ...base, evaluation: { status: 'evaluated', llmNextAction: 'targeted_review' } });
    expect(review).toMatchObject({ action: 'targeted_review', rule: 7 });
    expect(review.reviewItem).toMatchObject({ reason: 'weak_dimension', dueOn: TOMORROW });
    const probe = selectNextAction({ ...base, evaluation: { status: 'evaluated', llmNextAction: 'probe' } });
    expect(probe).toMatchObject({ action: 'probe', rule: 7 });
    expect(probe.probe).not.toBeNull();
    expect(selectNextAction({ ...base, probes: capped, evaluation: { status: 'evaluated', llmNextAction: 'probe' } })).toMatchObject({ action: 'continue', rule: 7 });
    expect(selectNextAction({ ...base, evaluation: { status: 'evaluated', llmNextAction: 'continue' } })).toMatchObject({ action: 'continue', rule: 7 });
  });

  it('an LLM nextAction outside LLM_NEXT_ACTIONS (hand-built context) is ignored', () => {
    const fresh = mastery({ band: 'developing' }, { understanding: { score: 80, evidenceCount: 2, lastEvidenceAt: NOW } });
    const bogus = { status: 'evaluated', llmNextAction: 'advance_early' } as unknown as NextActionContext['evaluation'];
    expect(selectNextAction(context({ mastery: fresh, evaluation: bogus }))).toMatchObject({ action: 'continue', rule: 8 });
  });
});

describe('second consecutive failure yields targeted_review and a ReviewItem due tomorrow', () => {
  it('creates a failed_attempt review item on the weakest evidenced dimension, excluding recently passed forms', () => {
    const state = mastery(
      { band: 'familiar', recentPassedFormKeys: ['q-1', 'q-2'], recentProbeAngles: ['why'] },
      { recall: { score: 50, evidenceCount: 3, maxDepthPassed: 2 }, understanding: { score: 35, evidenceCount: 1, maxDepthPassed: 0 } },
    );
    const decision = selectNextAction(
      context({ mastery: state, evidence: evidence({ depth: 2, correct: false, score: 0, selfConfidence: 2 }), verdict: 'unknown', consecutiveFailures: 2 }),
    );
    expect(decision).toMatchObject({ action: 'targeted_review', rule: 4 });
    expect(decision.reviewItem).toEqual({
      userId: 'user-1',
      conceptId: 'soql.in-loops',
      dimension: 'understanding',
      depth: 2,
      questionType: 'teach_back',
      angle: 'explain_without_jargon',
      excludeFormKeys: ['q-1', 'q-2'],
      dueOn: TOMORROW,
      intervalDays: 1,
      lastOutcome: null,
      reviewCount: 0,
      lapses: 0,
      reason: 'failed_attempt',
    });
  });

  it('a third failure in a row is still targeted_review; the first is reinforce', () => {
    const wrong = evidence({ depth: 2, correct: false, score: 0 });
    expect(selectNextAction(context({ evidence: wrong, consecutiveFailures: 1 }))).toMatchObject({ action: 'reinforce', rule: 4 });
    expect(selectNextAction(context({ evidence: wrong, consecutiveFailures: 3 }))).toMatchObject({ action: 'targeted_review', rule: 4 });
  });

  it('with no evidence at all (the /learn entry point) the rules fall through to continue', () => {
    expect(selectNextAction(context({ evidence: null, evaluation: { status: 'none', llmNextAction: null } }))).toMatchObject({ action: 'continue', rule: 8 });
  });
});
