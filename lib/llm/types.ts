// Argument and result contracts for every Claude call (ARCHITECTURE.md LLM §A). Deliberately no 'server-only'
// import: fake.ts (used by Playwright journeys) and the orchestrator tests import these without an RSC bundle.
// Relative `.ts` specifiers only; type-only imports are erased under plain node type stripping.
import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import type { LlmClass } from '../assessments/types.ts';

export const EVALUATE_FAILURE_REASONS = ['parse_null', 'truncated', 'refusal', 'error'] as const;
export type EvaluateFailureReason = (typeof EVALUATE_FAILURE_REASONS)[number];

export interface EvaluateUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface EvaluateSuccess<T> {
  ok: true;
  output: T;
  /** Model id the API reported (`'fake'` under LLM_MODE=fake). */
  model: string;
  /** Token accounting from the response; null for the fake responder. */
  usage: EvaluateUsage | null;
}

export interface EvaluateFailure {
  ok: false;
  reason: EvaluateFailureReason;
  /** Human-readable cause for logs; never shown to the learner. */
  detail: string;
}

/** `parsed_output == null`, `stop_reason !== 'end_turn'`, a refusal, or an SDK/API error all land on `ok: false`. */
export type EvaluateResult<T> = EvaluateSuccess<T> | EvaluateFailure;

export interface EvaluateArgs<TSchema extends z.ZodType> {
  class: LlmClass;
  schema: TSchema;
  /** One byte-stable text block per class with `cache_control: ephemeral` (see prompts.ts `buildSystem`). */
  system: Anthropic.TextBlockParam[];
  /** Per-question context first, `<learner_answer>` always last (see prompts.ts `buildMessages`). */
  messages: Anthropic.MessageParam[];
}

/** Shape shared by the live client and the fake responder so orchestrators can be tested without a network. */
export type Evaluator = <TSchema extends z.ZodType>(
  args: EvaluateArgs<TSchema>,
) => Promise<EvaluateResult<z.infer<TSchema>>>;
