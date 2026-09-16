// Next-action selection (ARCHITECTURE.md Learning Engine section 5): eight rules evaluated top-down. The LLM's
// suggestion is consulted only at rule 7 and only when it is one of LLM_NEXT_ACTIONS. Pure.
import type { ConfidenceVerdict, Depth, Evidence, MasteryState } from '../mastery-engine/types.ts';
import { ENGINE_CONFIG } from './config.ts';
import type { EngineConfig } from './config.ts';
import { probesRemaining, selectProbeAngle, shouldProbe } from './probes.ts';
import type { ProbeConceptTemplates, ProbeCounts, ProbeSelection } from './probes.ts';
import { reviewItemDraft } from './session.ts';
import type { ReviewItemDraft, ReviewSession } from './session.ts';
import { LLM_NEXT_ACTIONS } from './types.ts';
import type { LlmNextAction, NextAction } from './types.ts';
import { bandAtLeast, toDepth } from './util.ts';
import type { Instant } from './util.ts';

/** How the latest attempt was (or was not) graded. */
export type EvaluationStatus = 'none' | 'evaluated' | 'pending_evaluation' | 'quota_exceeded';

export type NextActionRule = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** `reinforce`: caveman re-explanation of the concept plus one question at the failed depth - reinforceDepthStep. */
export interface ReinforceTarget {
  step: 'caveman';
  depth: Depth;
}

export interface NextActionSession extends ReviewSession {
  now: Instant;
  /** Wall-clock time since the session started. */
  elapsedMs: number;
  /** The learner is between steps (end_session is only offered at a boundary). */
  atStepBoundary: boolean;
}

export interface NextActionContext {
  /** Mastery of the concept the latest attempt was on (as it stands when the answer arrives). */
  mastery: MasteryState;
  /** The attempt just recorded; null at the /learn entry point. */
  evidence: Evidence | null;
  /** Verdict stored on this attempt, if any. */
  verdict: ConfidenceVerdict | null;
  /** Latest verdict on the concept before this attempt (`suspicious` forces the next probe). */
  previousVerdict: ConfidenceVerdict | null;
  evaluation: { status: EvaluationStatus; llmNextAction: LlmNextAction | null };
  /** `check_llm_quota` allows a Claude call right now. */
  llmQuotaAvailable: boolean;
  probes: ProbeCounts;
  /** Consecutive wrong answers on the concept, including this attempt. */
  consecutiveFailures: number;
  concept: ProbeConceptTemplates;
  /** Result of earlyAdvanceOffered for the lesson. */
  earlyAdvance: boolean;
  session: NextActionSession;
  config?: EngineConfig;
}

export interface NextActionDecision {
  action: NextAction;
  rule: NextActionRule;
  probe: ProbeSelection | null;
  reviewItem: ReviewItemDraft | null;
  reinforce: ReinforceTarget | null;
}

function decide(action: NextAction, rule: NextActionRule, extra: Partial<Omit<NextActionDecision, 'action' | 'rule'>> = {}): NextActionDecision {
  return { action, rule, probe: null, reviewItem: null, reinforce: null, ...extra };
}

function isLlmNextAction(value: string): value is LlmNextAction {
  return (LLM_NEXT_ACTIONS as readonly string[]).includes(value);
}

/**
 * 1 quota exceeded / pending evaluation => retry_later; 2 shouldProbe or suspicious with probes remaining => probe;
 * 3 suspicious with no probe possible => reinforce; 4 wrong answer => reinforce, second in a row => targeted_review
 * (ReviewItem due tomorrow); 5 early-advance condition => advance_early; 6 session over sessionMinutes at a boundary
 * => end_session; 7 the LLM's nextAction (challenge only at band >= challengeMinBand); 8 continue.
 */
export function selectNextAction(ctx: NextActionContext): NextActionDecision {
  const config = ctx.config ?? ENGINE_CONFIG;

  // 1. The LLM could not grade: the lesson continues with the next deterministic step.
  if (ctx.evaluation.status === 'quota_exceeded' || ctx.evaluation.status === 'pending_evaluation') return decide('retry_later', 1);

  const remaining = probesRemaining(ctx.probes, config.probe);
  const suspicious = ctx.verdict === 'suspicious';
  const reinforce = (): ReinforceTarget => ({
    step: 'caveman',
    depth: toDepth((ctx.evidence?.depth ?? config.probe.bandDepthFloor[ctx.mastery.band]) - config.learning.reinforceDepthStep),
  });
  const pickProbe = (): ProbeSelection | null => selectProbeAngle(ctx.mastery, ctx.concept, ctx.llmQuotaAvailable, config.probe);

  // 2. Probe: trigger after a correct answer, or the mandatory different-angle probe after a suspicious verdict.
  const triggered =
    ctx.evidence !== null &&
    shouldProbe(
      ctx.mastery,
      ctx.evidence,
      { now: ctx.session.now, probesToday: ctx.probes.probesToday, probesThisSession: ctx.probes.probesThisSession, previousVerdict: ctx.previousVerdict },
      config.probe,
    );
  if (triggered || (suspicious && remaining)) {
    const probe = pickProbe();
    if (probe !== null) return decide('probe', 2, { probe });
    // 3. Mandatory probe impossible (caps, quota without a predict template, no angle left) => reinforce.
    if (suspicious) return decide('reinforce', 3, { reinforce: reinforce() });
  }
  if (suspicious && !remaining) return decide('reinforce', 3, { reinforce: reinforce() });

  // 4. Wrong answer (any self-confidence, including overconfident): reinforce, then targeted_review.
  if (ctx.evidence !== null && !ctx.evidence.correct) {
    if (ctx.consecutiveFailures >= config.learning.consecutiveFailuresForTargetedReview) {
      return decide('targeted_review', 4, { reviewItem: reviewItemDraft(ctx.mastery, 'failed_attempt', ctx.session, config) });
    }
    return decide('reinforce', 4, { reinforce: reinforce() });
  }

  // 5. Deterministic early-advance offer (the learner may decline).
  if (ctx.earlyAdvance) return decide('advance_early', 5);

  // 6. Session over budget at a step boundary.
  if (ctx.session.atStepBoundary && ctx.session.elapsedMs > config.learning.sessionMinutes * 60_000) return decide('end_session', 6);

  // 7. The LLM's suggestion, when it is a member of LLM_NEXT_ACTIONS and not contradicted above.
  const llm = ctx.evaluation.llmNextAction;
  if (llm !== null && isLlmNextAction(llm)) {
    switch (llm) {
      case 'challenge':
        return decide(bandAtLeast(ctx.mastery.band, config.learning.challengeMinBand) ? 'challenge' : 'continue', 7);
      case 'probe': {
        const probe = remaining ? pickProbe() : null;
        return probe === null ? decide('continue', 7) : decide('probe', 7, { probe });
      }
      case 'reinforce':
        return decide('reinforce', 7, { reinforce: reinforce() });
      case 'targeted_review':
        return decide('targeted_review', 7, { reviewItem: reviewItemDraft(ctx.mastery, 'weak_dimension', ctx.session, config) });
      case 'continue':
        return decide('continue', 7);
    }
  }

  // 8.
  return decide('continue', 8);
}
