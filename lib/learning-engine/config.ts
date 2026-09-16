// Learning-engine numbers. Every value comes from ARCHITECTURE.md "Learning Engine and Mastery Model"
// sections 1 (step machine, budgets, nudge, early advance, flex actions), 4 (PROBE_CONFIG), 5 (next action)
// and 6 (DIFFICULTY_CONFIG). Engine files read these tables and never carry a literal number.
// Relative `.ts` specifiers only: data/** and scripts/** may import this under plain node type stripping.
import type { Band, Depth, Dimension } from '../mastery-engine/types.ts';
import type { IntervalDays } from '../spaced-repetition/types.ts';
import type { XpReason } from '../gamification/types.ts';
import type { ProbeAngle, QuestionType, Segment, SessionStep, StepStatus } from './types.ts';

export type StepKind = 'read' | 'interactive' | 'evaluated';

export interface StepSpec {
  readonly segment: Segment;
  readonly budgetMin: number;
  readonly kind: StepKind;
}

export interface LearningConfig {
  /** Default day session length; also the "continue tomorrow" and `end_session` threshold. */
  readonly sessionMinutes: number;
  /** `duration_ms` clamp shared with the migration (attempts, step states, advance_step). */
  readonly serverClampMs: number;
  /** Steps a session may complete through `complete_read_step` (learner-skippable, no attempt required). */
  readonly readSteps: readonly SessionStep[];
  /** Statuses `complete_read_step` accepts. */
  readonly readStepStatuses: readonly StepStatus[];
  /** Segment, soft budget and kind per session step (table in section 1). */
  readonly steps: Readonly<Record<SessionStep, StepSpec>>;
  /** Soft budget per segment; equals the sum of its steps and sums to sessionMinutes. */
  readonly segmentBudgetMin: Readonly<Record<Segment, number>>;
  /** Warm-up shape: 1-3 due review items plus one boss-style question. */
  readonly warmup: { readonly reviewMin: number; readonly reviewMax: number; readonly bossQuestions: number };
  /** Linked review items served by the spaced_review step. */
  readonly spacedReviewMax: number;
  /** "Continue tomorrow" nudge: segment at > factor x budget, shown at most maxPerSession times. */
  readonly nudge: { readonly segmentOverBudgetFactor: number; readonly maxPerSession: number };
  /** Every lesson concept must reach this band before `advance_early` is offered (mirrors MASTERY_CONFIG.earlyAdvanceBand). */
  readonly earlyAdvanceBand: Band;
  /** Without today's teach-back step, each concept needs prior-day Teach-back evidence at or above this score. */
  readonly earlyAdvanceTeachBackMin: number;
  /** XP written when a lesson completes early through the gate or early advance: lesson_completed only. */
  readonly earlyAdvanceXpReasons: readonly XpReason[];
  /** `review_weakness` opens /review with at most this many items. */
  readonly reviewSessionMax: number;
  /** `next_mission` with a gap creates a ReviewItem for every concept below this band. */
  readonly gapReviewBand: Band;
  /** Targeted-review and skipped-with-gap items are due this many local days ahead (also their first interval). */
  readonly reviewDueDays: IntervalDays;
  /** Consecutive wrong answers on a concept before `targeted_review` replaces `reinforce`. */
  readonly consecutiveFailuresForTargetedReview: number;
  /** `reinforce` re-asks one question this many depth levels below the failed one. */
  readonly reinforceDepthStep: number;
  /** An LLM `challenge` suggestion is honoured only at or above this band. */
  readonly challengeMinBand: Band;
  /** The explain-why probe that accompanies every challenge-gate question. */
  readonly challengeProbe: { readonly angle: ProbeAngle; readonly questionType: QuestionType; readonly depthMin: Depth; readonly depthMax: Depth };
  /** Fallback question type per dimension for engine-generated review drafts when no probe angle fits. */
  readonly reviewQuestionType: Readonly<Record<Dimension, QuestionType>>;
}

export const LEARNING_CONFIG: LearningConfig = {
  sessionMinutes: 60,
  serverClampMs: 10_800_000,
  readSteps: ['curiosity', 'problem', 'caveman', 'technical', 'simulation'],
  readStepStatuses: ['active', 'completed', 'skipped'],
  steps: {
    warmup: { segment: 'warm_up', budgetMin: 5, kind: 'evaluated' },
    curiosity: { segment: 'learn', budgetMin: 2, kind: 'read' },
    problem: { segment: 'learn', budgetMin: 2, kind: 'read' },
    caveman: { segment: 'learn', budgetMin: 3, kind: 'read' },
    technical: { segment: 'learn', budgetMin: 3, kind: 'read' },
    simulation: { segment: 'deep_dive', budgetMin: 8, kind: 'interactive' },
    prediction: { segment: 'deep_dive', budgetMin: 7, kind: 'evaluated' },
    hands_on: { segment: 'lab', budgetMin: 15, kind: 'evaluated' },
    teach_back: { segment: 'teach_back', budgetMin: 5, kind: 'evaluated' },
    assessment: { segment: 'challenge', budgetMin: 3, kind: 'evaluated' },
    spaced_review: { segment: 'challenge', budgetMin: 2, kind: 'evaluated' },
    real_world_scenario: { segment: 'challenge', budgetMin: 5, kind: 'evaluated' },
  },
  segmentBudgetMin: { warm_up: 5, learn: 10, deep_dive: 15, lab: 15, teach_back: 5, challenge: 10 },
  warmup: { reviewMin: 1, reviewMax: 3, bossQuestions: 1 },
  spacedReviewMax: 3,
  nudge: { segmentOverBudgetFactor: 1.5, maxPerSession: 1 },
  earlyAdvanceBand: 'competent',
  earlyAdvanceTeachBackMin: 70,
  earlyAdvanceXpReasons: ['lesson_completed'],
  reviewSessionMax: 5,
  gapReviewBand: 'developing',
  reviewDueDays: 1,
  consecutiveFailuresForTargetedReview: 2,
  reinforceDepthStep: 1,
  challengeMinBand: 'developing',
  challengeProbe: { angle: 'why', questionType: 'explain_why', depthMin: 2, depthMax: 5 },
  reviewQuestionType: {
    recall: 'mcq',
    understanding: 'explain_why',
    application: 'predict_outcome',
    debugging: 'debug_code',
    architecture: 'compare_approaches',
    teach_back: 'teach_back',
  },
};

export interface ProbeConfig {
  /** Minimum exercise depth at which a correct answer triggers an explain-why probe, per band. */
  readonly bandDepthFloor: Readonly<Record<Band, Depth>>;
  /** Understanding evidence younger than this many days suppresses the probe... */
  readonly understandingFreshDays: number;
  /** ...when its score is at or above this. */
  readonly understandingFreshScore: number;
  readonly maxProbesPerConceptPerDay: number;
  readonly maxProbesPerSession: number;
  /** `recentProbeAngles` window: the last N angles are never repeated. */
  readonly probeAngleRepeatWindow: number;
  /** A correct answer faster than this with high self-confidence forces a probe early in a concept. */
  readonly fastAnswerMs: number;
  readonly fastAnswerSelfConfidenceMin: number;
  /** The fast-confident trigger applies while the concept has fewer than this many pieces of evidence. */
  readonly fastAnswerEvidenceMax: number;
  /** Attempts considered by the consistency confidence source. */
  readonly consistencyWindow: number;
  /** Probe depth may not exceed bandDepthFloor + this. */
  readonly probeDepthAboveFloor: number;
  /** Highest transfer-chain rung. */
  readonly chainRungMax: number;
}

export const PROBE_CONFIG: ProbeConfig = {
  bandDepthFloor: { lost: 1, familiar: 2, developing: 3, competent: 4, strong: 5, mastered: 7 },
  understandingFreshDays: 3,
  understandingFreshScore: 70,
  maxProbesPerConceptPerDay: 2,
  maxProbesPerSession: 6,
  probeAngleRepeatWindow: 3,
  fastAnswerMs: 5000,
  fastAnswerSelfConfidenceMin: 4,
  fastAnswerEvidenceMax: 3,
  consistencyWindow: 5,
  probeDepthAboveFloor: 2,
  chainRungMax: 5,
};

export type DifficultyFallback = 'nearest_lower_then_higher';

export interface DifficultyConfig {
  /** Depth window per band: the question picker stays inside it, stepping from evidence. */
  readonly bandDepthWindow: Readonly<Record<Band, readonly [Depth, Depth]>>;
  readonly stepUpAfterConsecutiveCorrect: number;
  readonly stepUpAmount: number;
  /** A step-up may overshoot the window max by this much. */
  readonly stepUpOvershoot: number;
  readonly stepDownAfterFail: number;
  readonly stepDownAmount: number;
  /** `challenge_me` / `challenge` ask at bandDepthFloor + this. */
  readonly challengeJump: number;
  /** Negative deltas from a failed challenge gate are multiplied by this. */
  readonly challengeFailPenaltyFactor: number;
  readonly fallback: DifficultyFallback;
  readonly depthMin: Depth;
  readonly depthMax: Depth;
}

export const DIFFICULTY_CONFIG: DifficultyConfig = {
  bandDepthWindow: {
    lost: [1, 2],
    familiar: [2, 3],
    developing: [3, 4],
    competent: [4, 5],
    strong: [5, 7],
    mastered: [7, 8],
  },
  stepUpAfterConsecutiveCorrect: 2,
  stepUpAmount: 1,
  stepUpOvershoot: 1,
  stepDownAfterFail: 1,
  stepDownAmount: 1,
  challengeJump: 2,
  challengeFailPenaltyFactor: 0.5,
  fallback: 'nearest_lower_then_higher',
  depthMin: 1,
  depthMax: 8,
};

export interface EngineConfig {
  readonly learning: LearningConfig;
  readonly probe: ProbeConfig;
  readonly difficulty: DifficultyConfig;
}

export const ENGINE_CONFIG: EngineConfig = {
  learning: LEARNING_CONFIG,
  probe: PROBE_CONFIG,
  difficulty: DIFFICULTY_CONFIG,
};
