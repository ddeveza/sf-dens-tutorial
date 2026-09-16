// The single mapping from QuestionType onto the attempt_kind / scorer_kind / LLM-class vocabularies
// (ARCHITECTURE.md Engine §2 and LLM §A). Every switch is exhaustive: adding a QuestionType fails to compile here.
// Relative `.ts` specifiers only (imported by data/** and scripts/** under plain node type stripping).
import type { QuestionType } from '../learning-engine/types.ts';
import type { Depth } from '../mastery-engine/types.ts';
import { ASSESSMENT_CONFIG, type AssessmentConfig } from './config.ts';
import type { AttemptKind, LlmClass, ScorerKind } from './types.ts';

// Graded in lib/assessments with no network call. `lab` is the hands-on simulator run (pass/fail).
export const DETERMINISTIC_QUESTION_TYPES = [
  'mcq',
  'multi_select',
  'true_false',
  'predict_outcome',
  'order_execution',
  'debug_code',
  'find_anti_pattern',
  'lab',
] as const;
export type DeterministicQuestionType = (typeof DETERMINISTIC_QUESTION_TYPES)[number];
export type LlmQuestionType = Exclude<QuestionType, DeterministicQuestionType>;

function unknownQuestionType(value: never): never {
  throw new RangeError(`Unknown question type: ${String(value)}`);
}

/** `attempts.kind` for an exercise: the one place the QuestionType -> attempt_kind mapping is spelled out. */
export function attemptKindFor(questionType: QuestionType): AttemptKind {
  switch (questionType) {
    case 'mcq':
    case 'multi_select':
    case 'true_false':
    case 'order_execution':
    case 'debug_code':
    case 'find_anti_pattern':
      return 'question';
    case 'predict_outcome':
      return 'prediction';
    case 'explain_why':
      return 'explain_why';
    case 'teach_back':
      return 'teach_back';
    case 'compare_approaches':
    case 'architecture_decision':
    case 'fix_design':
    case 'scenario_diagnosis':
      return 'scenario';
    case 'lab':
      return 'lab';
    case 'boss':
      return 'boss';
    case 'capstone':
      return 'capstone';
    default:
      return unknownQuestionType(questionType);
  }
}

/** Which grader owns the type: `deterministic` (lib/assessments) or `llm` (lib/llm). */
export function scorerFor(questionType: QuestionType): ScorerKind {
  switch (questionType) {
    case 'mcq':
    case 'multi_select':
    case 'true_false':
    case 'predict_outcome':
    case 'order_execution':
    case 'debug_code':
    case 'find_anti_pattern':
    case 'lab':
      return 'deterministic';
    case 'explain_why':
    case 'compare_approaches':
    case 'architecture_decision':
    case 'fix_design':
    case 'scenario_diagnosis':
    case 'teach_back':
    case 'boss':
    case 'capstone':
      return 'llm';
    default:
      return unknownQuestionType(questionType);
  }
}

export function isDeterministic(questionType: QuestionType): questionType is DeterministicQuestionType {
  return scorerFor(questionType) === 'deterministic';
}

/**
 * LLM call class for an llm-graded exercise (drives model/effort/quota in lib/llm/config.ts), or null when the
 * type never reaches Claude. explain_why splits by depth: shallow (define/explain) is a `check`, applied-depth is a `probe`.
 */
export function llmClassFor(
  questionType: QuestionType,
  depth: Depth,
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): LlmClass | null {
  switch (questionType) {
    case 'explain_why':
      return depth <= config.llmClass.explainWhyCheckMaxDepth ? 'check' : 'probe';
    case 'teach_back':
    case 'compare_approaches':
    case 'architecture_decision':
    case 'fix_design':
    case 'scenario_diagnosis':
      return 'probe';
    case 'boss':
      return 'boss';
    case 'capstone':
      return 'capstone';
    case 'mcq':
    case 'multi_select':
    case 'true_false':
    case 'predict_outcome':
    case 'order_execution':
    case 'debug_code':
    case 'find_anti_pattern':
    case 'lab':
      return null;
    default:
      return unknownQuestionType(questionType);
  }
}
