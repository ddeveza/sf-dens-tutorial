// lib/mastery-engine/types.test-d.ts (vitest typecheck): one line per Postgres enum, so drift fails typecheck.
// An enum that drifts is fixed in the MIGRATION (then `npm run db:reset` + `npm run db:types`), never in the TS union.
import { expectTypeOf } from 'vitest';
import type { z } from 'zod';
import type { Enums } from '@/types/database';
import type { Band, Dimension, CapReason, ConfidenceVerdict, Evaluation } from './types.ts';
import type {
  QuestionType,
  ProbeAngle,
  SessionStep,
  StepStatus,
  SkipReason,
  FlexAction,
  LessonStatus,
  LlmNextAction as LlmNextActionUnion,
} from '../learning-engine/types.ts';
import type { AttemptKind, AttemptStatus, ScorerKind } from '../assessments/types.ts';
import type { ReviewOutcome, ReviewReason } from '../spaced-repetition/types.ts';
import type { XpReason, BossKind } from '../gamification/types.ts';
import type { EvaluationSchema, LlmNextAction } from '../llm/schemas.ts';

expectTypeOf<Band>().toEqualTypeOf<Enums<'mastery_band'>>();
expectTypeOf<Dimension>().toEqualTypeOf<Enums<'mastery_dimension'>>();
expectTypeOf<CapReason>().toEqualTypeOf<Enums<'cap_reason'>>();
expectTypeOf<ConfidenceVerdict>().toEqualTypeOf<Enums<'confidence_verdict'>>();
expectTypeOf<QuestionType>().toEqualTypeOf<Enums<'question_type'>>(); // includes 'predict_outcome' | 'lab' | 'boss' | 'capstone'
expectTypeOf<ProbeAngle>().toEqualTypeOf<Enums<'probe_angle'>>();
expectTypeOf<SessionStep>().toEqualTypeOf<Enums<'session_step'>>();
expectTypeOf<StepStatus>().toEqualTypeOf<Enums<'step_status'>>();
expectTypeOf<SkipReason>().toEqualTypeOf<Enums<'skip_reason'>>();
expectTypeOf<FlexAction>().toEqualTypeOf<Enums<'flex_action'>>();
expectTypeOf<LessonStatus>().toEqualTypeOf<Enums<'lesson_status'>>();
expectTypeOf<AttemptKind>().toEqualTypeOf<Enums<'attempt_kind'>>();
expectTypeOf<AttemptStatus>().toEqualTypeOf<Enums<'attempt_status'>>();
expectTypeOf<ScorerKind>().toEqualTypeOf<Enums<'scorer_kind'>>();
expectTypeOf<ReviewOutcome>().toEqualTypeOf<Enums<'review_outcome'>>();
expectTypeOf<ReviewReason>().toEqualTypeOf<Enums<'review_reason'>>();
expectTypeOf<XpReason>().toEqualTypeOf<Enums<'xp_reason'>>();
expectTypeOf<BossKind>().toEqualTypeOf<Enums<'boss_kind'>>();

// The model's next-action vocabulary is defined once (LLM_NEXT_ACTIONS) and the Zod enum is built from it.
expectTypeOf<z.infer<typeof LlmNextAction>>().toEqualTypeOf<LlmNextActionUnion>();
// Evaluation is derived from the schema, never redeclared.
expectTypeOf<Evaluation>().toEqualTypeOf<z.infer<typeof EvaluationSchema>>();
