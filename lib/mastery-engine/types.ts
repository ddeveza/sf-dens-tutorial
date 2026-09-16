// Mastery-engine types. `Band` is the only band type in the system (gamification re-exports it).
// Relative `.ts` specifiers only (imported transitively by data/** under plain node).
import type { z } from 'zod';
import type { EvaluationSchema } from '../llm/schemas.ts';
import type { ProbeAngle, QuestionType } from '../learning-engine/types.ts';
import type { ScorerKind } from '../assessments/types.ts';

export const DIMENSIONS = ['recall', 'understanding', 'application', 'debugging', 'architecture', 'teach_back'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const BANDS = ['lost', 'familiar', 'developing', 'competent', 'strong', 'mastered'] as const;
export type Band = (typeof BANDS)[number];

export const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type Depth = (typeof DEPTHS)[number];

export const CAP_REASONS = [
  'recall_only',
  'no_understanding',
  'no_application_or_debugging',
  'no_optimize_evidence',
  'no_design_evidence',
  'mastered_gate',
  'min_evidence',
] as const;
export type CapReason = (typeof CAP_REASONS)[number];

export const CONFIDENCE_VERDICTS = ['calibrated', 'suspicious', 'overconfident', 'underconfident', 'unknown'] as const;
export type ConfidenceVerdict = (typeof CONFIDENCE_VERDICTS)[number];

export type SelfConfidence = 1 | 2 | 3 | 4 | 5;
export type ChainRung = 0 | 1 | 2 | 3 | 4 | 5;

export type DimensionScores = Record<Dimension, number>;

export interface DimensionState {
  score: number; // integer 0-100, EMA
  evidenceCount: number; // primary evidence only
  maxDepthPassed: Depth | 0; // highest depth with score >= correctThreshold
  lastEvidenceAt: string | null;
}

export interface HeldCredit {
  attemptId: string;
  dimension: Dimension;
  delta: number;
  expiresAt: string;
}

export interface MasteryState {
  userId: string;
  conceptId: string;
  dims: Record<Dimension, DimensionState>;
  overallRaw: number; // weighted mean before caps
  overall: number; // min(overallRaw, bandMax[cappedBand])
  band: Band;
  capReason: CapReason | null; // first cap (table order) whose ceiling < bandFor(overallRaw); null if none bound
  consecutiveRecallCorrect: number;
  chainRung: ChainRung; // anti-cramming transfer chain
  lastProbeAngle: ProbeAngle | null;
  recentProbeAngles: ProbeAngle[]; // last probeAngleRepeatWindow
  recentPassedFormKeys: string[]; // last 20 form keys answered correctly
  recentPassedFormKeyAt: Record<string, string>; // formKey -> ISO timestamp (identicalFormWindowDays)
  held: HeldCredit[];
  weakAreas: string[]; // misconception ids, appended, deduped
  updatedAt: string;
}

export interface Evidence {
  attemptId: string;
  conceptId: string;
  questionType: QuestionType;
  formKey: string; // question id, or templateId + variant for generated questions
  dimension: Dimension; // primary dimension tag on the exercise
  depth: Depth;
  score: number; // 0-100
  correct: boolean; // score >= correctThreshold
  scorer: ScorerKind;
  selfConfidence: SelfConfidence | null;
  probeAngle: ProbeAngle | null;
  chainRung: Exclude<ChainRung, 0> | null;
  durationMs: number;
  at: string;
}

// Derived from the Zod schema, never redeclared.
export type Evaluation = z.infer<typeof EvaluationSchema>;

export interface DimensionUpdate {
  dimension: Dimension;
  before: number;
  after: number;
  delta: number;
}

export type EvalFlag = 'suspicious' | 'overconfident';
