// Day-session rules (ARCHITECTURE.md Learning Engine section 1): lesson progress, the continue-tomorrow nudge,
// the early-advance offer and the four flexibility actions. Pure; `now`, `todayLocal` and `timeZone` are passed in.
import type { Band, ConfidenceVerdict, Depth, MasteryState } from '../mastery-engine/types.ts';
import type { XpReason } from '../gamification/types.ts';
import type { ReviewItem, ReviewReason } from '../spaced-repetition/types.ts';
import { ENGINE_CONFIG, LEARNING_CONFIG } from './config.ts';
import type { EngineConfig, LearningConfig } from './config.ts';
import { challengeDepth } from './difficulty.ts';
import { PROBE_CATALOG, weakestEvidencedDimension } from './probes.ts';
import { isDone, isEvaluatedStep, segmentOf, STEP_ORDER } from './step-machine.ts';
import { PROBE_ANGLES } from './types.ts';
import type { FlexAction, ProbeAngle, QuestionType, Segment, SessionStep, SkipReason, StepState } from './types.ts';
import { addLocalDays, bandAtLeast, clamp, localDateOf, toDepth, toIso, toMs } from './util.ts';
import type { Instant } from './util.ts';

export { addLocalDays, localDateOf } from './util.ts';

// ---------------------------------------------------------------------------------------------------------------------
// Progress

function byStep(stepStates: readonly StepState[]): Map<SessionStep, StepState> {
  return new Map(stepStates.map((s) => [s.step, s]));
}

/** 0-100: completed or skipped session steps over the twelve in STEP_ORDER (dashboard `progressPct`). */
export function lessonProgress(stepStates: readonly StepState[]): number {
  const states = byStep(stepStates);
  const done = STEP_ORDER.filter((step) => {
    const s = states.get(step);
    return s !== undefined && isDone(s.status);
  }).length;
  return Math.round((100 * done) / STEP_ORDER.length);
}

/** First step in STEP_ORDER that is not completed/skipped; the last step once everything is done. */
export function currentStep(stepStates: readonly StepState[]): SessionStep {
  const states = byStep(stepStates);
  for (const step of STEP_ORDER) {
    const s = states.get(step);
    if (s === undefined || !isDone(s.status)) return step;
  }
  return STEP_ORDER[STEP_ORDER.length - 1];
}

/** Segment of the current step (dashboard `nextStep`). */
export function nextSegment(stepStates: readonly StepState[], config: LearningConfig = LEARNING_CONFIG): Segment {
  return segmentOf(currentStep(stepStates), config);
}

// ---------------------------------------------------------------------------------------------------------------------
// Continue-tomorrow nudge

export interface NudgeInput {
  now: Instant;
  /** When today's session began (warm-up entered). */
  sessionStartedAt: Instant;
  /** When the lesson proper began (first lesson step entered); null before that. */
  lessonStartedAt: Instant | null;
  segment: Segment;
  /** Active time accumulated in the current segment. */
  segmentElapsedMs: number;
  /** Nudges already shown this session. */
  nudgesShown: number;
  /** The learner explicitly chose to continue after a nudge. */
  learnerContinued: boolean;
}

/**
 * True when a segment runs past segmentOverBudgetFactor x its budget or the session passes sessionMinutes; at most
 * nudge.maxPerSession times, never after the learner explicitly continued, never for a lesson started after the
 * sessionMinutes mark.
 */
export function shouldNudgeContinueTomorrow(input: NudgeInput, config: LearningConfig = LEARNING_CONFIG): boolean {
  if (input.nudgesShown >= config.nudge.maxPerSession) return false;
  if (input.learnerContinued) return false;
  const sessionMs = config.sessionMinutes * 60_000;
  const start = toMs(input.sessionStartedAt);
  if (input.lessonStartedAt !== null && toMs(input.lessonStartedAt) - start > sessionMs) return false;
  const segmentBudgetMs = config.segmentBudgetMin[input.segment] * 60_000;
  const segmentOver = input.segmentElapsedMs > segmentBudgetMs * config.nudge.segmentOverBudgetFactor;
  const sessionOver = toMs(input.now) - start > sessionMs;
  return segmentOver || sessionOver;
}

// ---------------------------------------------------------------------------------------------------------------------
// Early advance

export interface LocalDaySession {
  todayLocal: string;
  timeZone: string;
}

function teachBackFromPreviousDay(mastery: Pick<MasteryState, 'dims'>, config: LearningConfig, session: LocalDaySession): boolean {
  const teachBack = mastery.dims.teach_back;
  if (teachBack.evidenceCount < 1 || teachBack.lastEvidenceAt === null) return false;
  if (teachBack.score < config.earlyAdvanceTeachBackMin) return false;
  return localDateOf(teachBack.lastEvidenceAt, session.timeZone) < session.todayLocal;
}

/**
 * `advance_early` is offered when every lesson concept is at or above earlyAdvanceBand and, unless the teach_back
 * step is already done today, each concept has Teach-back evidence >= earlyAdvanceTeachBackMin from a previous
 * learner-local day. Deterministic; the LLM never suggests it.
 */
export function earlyAdvanceOffered(
  masteries: ReadonlyArray<Pick<MasteryState, 'band' | 'dims'>>,
  teachBackDone: boolean,
  config: LearningConfig,
  session: LocalDaySession,
): boolean {
  if (masteries.length === 0) return false;
  return masteries.every(
    (m) => bandAtLeast(m.band, config.earlyAdvanceBand) && (teachBackDone || teachBackFromPreviousDay(m, config, session)),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Review item drafts (the DB assigns the uuid; spaced-repetition's generateReviewItem is the richer generator)

export type ReviewItemDraft = Omit<ReviewItem, 'id'>;

export type LessonConceptMastery = Pick<MasteryState, 'conceptId' | 'band' | 'dims' | 'recentProbeAngles' | 'recentPassedFormKeys'>;

export interface ReviewSession {
  userId: string;
  todayLocal: string;
}

/**
 * A review item on the concept's weakest evidenced dimension (Understanding if none), at
 * max(band window min, maxDepthPassed) inside the chosen angle's range, at an angle not in recentProbeAngles,
 * excluding recentPassedFormKeys, due reviewDueDays ahead.
 */
export function reviewItemDraft(
  mastery: LessonConceptMastery,
  reason: ReviewReason,
  session: ReviewSession,
  config: EngineConfig = ENGINE_CONFIG,
): ReviewItemDraft {
  const dimension = weakestEvidencedDimension(mastery.dims);
  const [windowMin] = config.difficulty.bandDepthWindow[mastery.band];
  const recent = new Set(mastery.recentProbeAngles);
  const entry = PROBE_ANGLES.map((angle) => PROBE_CATALOG[angle]).find((e) => e.dimension === dimension && !recent.has(e.angle)) ?? null;
  const rawDepth = Math.max(windowMin, mastery.dims[dimension].maxDepthPassed);
  const depth: Depth = entry === null ? toDepth(rawDepth) : toDepth(clamp(rawDepth, entry.depthMin, entry.depthMax));
  const questionType: QuestionType = entry === null ? config.learning.reviewQuestionType[dimension] : entry.questionType;
  const angle: ProbeAngle | null = entry === null ? null : entry.angle;
  return {
    userId: session.userId,
    conceptId: mastery.conceptId,
    dimension,
    depth,
    questionType,
    angle,
    excludeFormKeys: [...mastery.recentPassedFormKeys],
    dueOn: addLocalDays(session.todayLocal, config.learning.reviewDueDays),
    intervalDays: config.learning.reviewDueDays,
    lastOutcome: null,
    reviewCount: 0,
    lapses: 0,
    reason,
  };
}

/** One `skipped_with_gap` review item per lesson concept below gapReviewBand, due tomorrow. */
export function gapReviewItems(masteries: readonly LessonConceptMastery[], session: ReviewSession, config: EngineConfig = ENGINE_CONFIG): ReviewItemDraft[] {
  return masteries
    .filter((m) => !bandAtLeast(m.band, config.learning.gapReviewBand))
    .map((m) => reviewItemDraft(m, 'skipped_with_gap', session, config));
}

// ---------------------------------------------------------------------------------------------------------------------
// Challenge gate

export interface ChallengeGateItem {
  conceptId: string;
  band: Band;
  /** One question from the deterministic pool at min(8, bandDepthFloor + challengeJump). */
  questionDepth: Depth;
  /** Plus one explain_why probe. */
  probe: { angle: ProbeAngle; questionType: QuestionType; depth: Depth };
}

export interface ChallengeGate {
  items: ChallengeGateItem[];
}

export function buildChallengeGate(masteries: ReadonlyArray<Pick<MasteryState, 'conceptId' | 'band'>>, config: EngineConfig = ENGINE_CONFIG): ChallengeGate {
  const probe = config.learning.challengeProbe;
  return {
    items: masteries.map((m) => {
      const questionDepth = challengeDepth(m.band, config.probe, config.difficulty);
      return {
        conceptId: m.conceptId,
        band: m.band,
        questionDepth,
        probe: { angle: probe.angle, questionType: probe.questionType, depth: toDepth(clamp(questionDepth, probe.depthMin, probe.depthMax)) },
      };
    }),
  };
}

export interface ChallengeGateResult {
  conceptId: string;
  questionCorrect: boolean;
  probeCorrect: boolean;
  probeVerdict: ConfidenceVerdict | null;
}

export interface ChallengeGateOutcome {
  passed: boolean;
  /** First concept (gate order) whose question or probe failed, or whose probe verdict was suspicious. */
  failingConceptId: string | null;
}

/** Pass = every question and probe correct and no `suspicious` verdict; a missing result counts as a failure. */
export function resolveChallengeGate(gate: ChallengeGate, results: readonly ChallengeGateResult[]): ChallengeGateOutcome {
  for (const item of gate.items) {
    const result = results.find((r) => r.conceptId === item.conceptId);
    if (result === undefined || !result.questionCorrect || !result.probeCorrect || result.probeVerdict === 'suspicious') {
      return { passed: false, failingConceptId: item.conceptId };
    }
  }
  return { passed: true, failingConceptId: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Review selection

/** Weakest-dimension candidate: the item plus the score of the dimension it targets. */
export interface WeakReviewCandidate {
  item: ReviewItem;
  score: number;
}

/** `review_weakness`: due items first (earliest due first), then weakest-dimension items, capped at reviewSessionMax. */
export function reviewWeaknessItems(
  due: readonly ReviewItem[],
  weak: readonly WeakReviewCandidate[],
  config: LearningConfig = LEARNING_CONFIG,
): ReviewItem[] {
  const seen = new Set<string>();
  const out: ReviewItem[] = [];
  const push = (item: ReviewItem): void => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  };
  for (const item of [...due].sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))) push(item);
  for (const candidate of [...weak].sort((a, b) => a.score - b.score)) push(candidate.item);
  return out.slice(0, config.reviewSessionMax);
}

/**
 * spaced_review step: candidates minus items already served in warm-up, angles not used in warm-up first,
 * capped at spacedReviewMax. (StepPayload for warmup carries attempt ids only; the caller derives the served ids.)
 */
export function selectSpacedReviewItems(
  candidates: readonly ReviewItem[],
  servedReviewItemIds: readonly string[],
  usedAngles: readonly ProbeAngle[],
  config: LearningConfig = LEARNING_CONFIG,
): ReviewItem[] {
  const served = new Set(servedReviewItemIds);
  const used = new Set(usedAngles);
  const eligible = candidates.filter((item) => !served.has(item.id));
  const freshAngle = eligible.filter((item) => item.angle === null || !used.has(item.angle));
  const usedAngle = eligible.filter((item) => item.angle !== null && used.has(item.angle));
  return [...freshAngle, ...usedAngle].slice(0, config.spacedReviewMax);
}

// ---------------------------------------------------------------------------------------------------------------------
// Flex actions

export interface FlexSession extends ReviewSession, LocalDaySession {
  now: Instant;
}

export interface FlexActionInput {
  action: FlexAction;
  lessonId: string;
  /** Every step row of the lesson (callers synthesize missing rows with initialStepState). */
  stepStates: readonly StepState[];
  /** Mastery of every concept the lesson covers. */
  masteries: readonly LessonConceptMastery[];
  /** The teach_back step is already done today. */
  teachBackDone: boolean;
  session: FlexSession;
  /** challenge_me, second call: the graded gate answers. */
  gateResults?: readonly ChallengeGateResult[];
  /** next_mission: the learner confirmed the gap dialog. */
  confirmed?: boolean;
  /** review_weakness: due items and weakest-dimension candidates. */
  dueItems?: readonly ReviewItem[];
  weakItems?: readonly WeakReviewCandidate[];
  config?: EngineConfig;
}

export type FlexActionResult =
  | { action: 'continue'; flexActionLast: 'continue'; resumeAt: SessionStep }
  | { action: 'challenge_me'; flexActionLast: 'challenge_me'; phase: 'gate'; gate: ChallengeGate }
  | {
      action: 'challenge_me';
      flexActionLast: 'challenge_me';
      phase: 'passed';
      nextAction: 'advance_early';
      lessonStatus: 'completed_early';
      stepPatches: StepState[];
      xpReasons: readonly XpReason[];
    }
  | {
      action: 'challenge_me';
      flexActionLast: 'challenge_me';
      phase: 'failed';
      nextAction: 'reinforce';
      jumpTo: 'caveman';
      failingConceptId: string;
      /** Multiply negative deltas from the gate by this before applying. */
      penaltyFactor: number;
      stepPatches: StepState[];
      xpReasons: readonly XpReason[];
    }
  | { action: 'review_weakness'; flexActionLast: 'review_weakness'; items: ReviewItem[] }
  | {
      action: 'next_mission';
      flexActionLast: 'next_mission';
      outcome: 'unlock_next';
      lessonStatus: 'completed_early';
      stepPatches: StepState[];
      xpReasons: readonly XpReason[];
    }
  | { action: 'next_mission'; flexActionLast: 'next_mission'; outcome: 'confirm_required' }
  | {
      action: 'next_mission';
      flexActionLast: 'next_mission';
      outcome: 'skipped_with_gap';
      lessonStatus: 'skipped_with_gap';
      stepPatches: StepState[];
      reviewItems: ReviewItemDraft[];
      xpReasons: readonly XpReason[];
    };

/** Every not-yet-done step becomes `skipped` with the reason `reasonFor(step)` returns. */
export function skipRemainingSteps(
  stepStates: readonly StepState[],
  at: Instant,
  reasonFor: (step: SessionStep) => SkipReason,
): StepState[] {
  const iso = toIso(at);
  return stepStates
    .filter((s) => !isDone(s.status))
    .map((s) => ({ ...s, status: 'skipped' as const, skipReason: reasonFor(s.step), completedAt: s.completedAt ?? iso }));
}

function earlyCompletionPatches(stepStates: readonly StepState[], at: Instant, config: EngineConfig): StepState[] {
  return skipRemainingSteps(stepStates, at, (step) => (isEvaluatedStep(step, config.learning) ? 'challenge_gate' : 'confident'));
}

export function applyFlexAction(input: FlexActionInput): FlexActionResult {
  const config = input.config ?? ENGINE_CONFIG;
  const stepStates = input.stepStates.filter((s) => s.lessonId === input.lessonId);

  switch (input.action) {
    case 'continue':
      return { action: 'continue', flexActionLast: 'continue', resumeAt: currentStep(stepStates) };

    case 'challenge_me': {
      const gate = buildChallengeGate(input.masteries, config);
      if (input.gateResults === undefined) return { action: 'challenge_me', flexActionLast: 'challenge_me', phase: 'gate', gate };
      const outcome = resolveChallengeGate(gate, input.gateResults);
      if (outcome.passed) {
        return {
          action: 'challenge_me',
          flexActionLast: 'challenge_me',
          phase: 'passed',
          nextAction: 'advance_early',
          lessonStatus: 'completed_early',
          stepPatches: earlyCompletionPatches(stepStates, input.session.now, config),
          xpReasons: config.learning.earlyAdvanceXpReasons,
        };
      }
      return {
        action: 'challenge_me',
        flexActionLast: 'challenge_me',
        phase: 'failed',
        nextAction: 'reinforce',
        jumpTo: 'caveman',
        failingConceptId: outcome.failingConceptId ?? '',
        penaltyFactor: config.difficulty.challengeFailPenaltyFactor,
        stepPatches: [],
        xpReasons: [],
      };
    }

    case 'review_weakness':
      return {
        action: 'review_weakness',
        flexActionLast: 'review_weakness',
        items: reviewWeaknessItems(input.dueItems ?? [], input.weakItems ?? [], config.learning),
      };

    case 'next_mission': {
      if (earlyAdvanceOffered(input.masteries, input.teachBackDone, config.learning, input.session)) {
        return {
          action: 'next_mission',
          flexActionLast: 'next_mission',
          outcome: 'unlock_next',
          lessonStatus: 'completed_early',
          stepPatches: earlyCompletionPatches(stepStates, input.session.now, config),
          xpReasons: config.learning.earlyAdvanceXpReasons,
        };
      }
      if (input.confirmed !== true) return { action: 'next_mission', flexActionLast: 'next_mission', outcome: 'confirm_required' };
      return {
        action: 'next_mission',
        flexActionLast: 'next_mission',
        outcome: 'skipped_with_gap',
        lessonStatus: 'skipped_with_gap',
        stepPatches: skipRemainingSteps(stepStates, input.session.now, () => 'move_on'),
        reviewItems: gapReviewItems(input.masteries, input.session, config),
        xpReasons: [],
      };
    }
  }
}
