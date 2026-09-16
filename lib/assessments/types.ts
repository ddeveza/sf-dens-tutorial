// Attempt-level unions shared by lib/assessments, lib/mastery-engine and db/queries. Each mirrors a Postgres enum.
export const ATTEMPT_KINDS = ['question', 'prediction', 'explain_why', 'teach_back', 'scenario', 'lab', 'boss', 'capstone'] as const;
export type AttemptKind = (typeof ATTEMPT_KINDS)[number];

export const ATTEMPT_STATUSES = ['evaluated', 'pending_evaluation', 'needs_review'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const SCORER_KINDS = ['deterministic', 'llm'] as const;
export type ScorerKind = (typeof SCORER_KINDS)[number];

export const LLM_CLASSES = ['check', 'probe', 'boss', 'capstone'] as const;
export type LlmClass = (typeof LLM_CLASSES)[number];

// Result of a deterministic scorer. `score` is 0-100; `correct` = score >= MASTERY_CONFIG.correctThreshold.
export interface DeterministicScore {
  score: number;
  correct: boolean;
  detail?: Record<string, number | string | boolean | number[] | string[]>;
}
