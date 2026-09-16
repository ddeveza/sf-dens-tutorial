// Learning-engine unions. Every union here mirrors a Postgres enum in supabase/migrations and is pinned
// to `Enums<'...'>` by lib/mastery-engine/types.test-d.ts. Relative `.ts` specifiers only: data/** and
// scripts/** import this file under plain `node` type stripping.
import type { SimId } from '../simulations/rule-set.ts';

export const LESSON_STEPS = [
  'curiosity',
  'problem',
  'caveman',
  'technical',
  'simulation',
  'prediction',
  'hands_on',
  'teach_back',
  'assessment',
  'spaced_review',
  'real_world_scenario',
] as const;
export type LessonStep = (typeof LESSON_STEPS)[number];

export const SESSION_STEPS = ['warmup', ...LESSON_STEPS] as const;
export type SessionStep = (typeof SESSION_STEPS)[number];

export const SEGMENTS = ['warm_up', 'learn', 'deep_dive', 'lab', 'teach_back', 'challenge'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const STEP_STATUSES = [
  'locked',
  'available',
  'active',
  'awaiting_prediction',
  'predicted',
  'revealed',
  'submitted',
  'pending_evaluation',
  'completed',
  'skipped',
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const SKIP_REASONS = ['confident', 'challenge_gate', 'move_on'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const FLEX_ACTIONS = ['continue', 'challenge_me', 'review_weakness', 'next_mission'] as const;
export type FlexAction = (typeof FLEX_ACTIONS)[number];

export const LESSON_STATUSES = ['not_started', 'in_progress', 'completed', 'completed_early', 'skipped_with_gap'] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

// One spelling everywhere: predict_outcome (never 'predict'); 'lab', 'boss', 'capstone' are real question types.
export const QUESTION_TYPES = [
  'mcq',
  'multi_select',
  'true_false',
  'predict_outcome',
  'order_execution',
  'debug_code',
  'find_anti_pattern',
  'explain_why',
  'compare_approaches',
  'architecture_decision',
  'fix_design',
  'scenario_diagnosis',
  'teach_back',
  'lab',
  'boss',
  'capstone',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const PROBE_ANGLES = [
  'why',
  'what_if',
  'what_breaks',
  'what_would_you_change',
  'explain_without_jargon',
  'explain_to_junior',
  'predict',
] as const;
export type ProbeAngle = (typeof PROBE_ANGLES)[number];

// The single definition of what the model may suggest; lib/llm/schemas.ts builds z.enum(LLM_NEXT_ACTIONS) from it.
export const LLM_NEXT_ACTIONS = ['continue', 'probe', 'reinforce', 'targeted_review', 'challenge'] as const;
export type LlmNextAction = (typeof LLM_NEXT_ACTIONS)[number];
// System-only members: never accepted from the model.
export type NextAction = LlmNextAction | 'advance_early' | 'retry_later' | 'end_session';

export type StepPayload =
  | { step: 'prediction'; predictionId: string; choice: string; capturedAt: string; revealedAt: string | null }
  | { step: 'simulation'; simulator: SimId; finalState: unknown }
  | { step: 'caveman' | 'technical'; toggles: number }
  | { step: 'warmup' | 'hands_on' | 'teach_back' | 'assessment' | 'real_world_scenario'; attemptIds: string[] }
  | { step: 'spaced_review'; reviewItemIds: string[]; attemptIds: string[] }
  | { step: 'curiosity' | 'problem' };

export interface StepState {
  lessonId: string;
  step: SessionStep;
  status: StepStatus;
  enteredAt: string | null; // ISO; set on first 'active'
  completedAt: string | null;
  durationMs: number; // accumulated active time, client-reported, server-clamped to <= 3h
  skipReason: SkipReason | null;
  payload: StepPayload;
}
