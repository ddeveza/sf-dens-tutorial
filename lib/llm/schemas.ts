// Structured-output schemas for every Claude call. `.strict()` renders additionalProperties: false, which
// structured outputs require. This file deliberately has no 'server-only' import: the pure mastery engine
// imports its types, and data/** may import it under plain node.
import { z } from 'zod';
import { LLM_NEXT_ACTIONS } from '../learning-engine/types.ts';

export const Score = z.number().int().min(0).max(100);

export const Misconception = z
  .object({
    id: z.string().nullable(), // one of the concept's declared misconception ids, or null = new
    summary: z.string().min(3).max(160),
  })
  .strict();
export type MisconceptionOut = z.infer<typeof Misconception>;

// 'retry_later', 'advance_early', 'end_session' are system-only NextAction members and never accepted from the model.
export const LlmNextAction = z.enum(LLM_NEXT_ACTIONS);

export const EvaluationSchema = z
  .object({
    correctness: Score,
    understanding: Score,
    application: Score,
    architecture: Score,
    confidence: Score, // model's belief the learner understands, not correctness
    masteryDelta: z.number().int().min(-10).max(10), // sign gate only; magnitude is never applied
    misconceptions: z.array(Misconception).max(5),
    nextAction: LlmNextAction,
    feedback: z.string().max(600), // learner-visible plain text
  })
  .strict();
export type EvaluationOut = z.infer<typeof EvaluationSchema>;

export const BOSS_RUBRIC_KEYS = ['suspect', 'why', 'dataNeeded', 'whatToInspect', 'solution', 'tradeOffs'] as const;
export type BossRubricKey = (typeof BOSS_RUBRIC_KEYS)[number];

export const BossRubricSchema = z
  .object({
    suspect: Score,
    why: Score,
    dataNeeded: Score,
    whatToInspect: Score,
    solution: Score,
    tradeOffs: Score,
    overall: Score, // advisory; recomputed deterministically as round(mean of the six)
    misconceptions: z.array(Misconception).max(8),
    strengths: z.array(z.string().max(160)).max(5),
    gaps: z.array(z.string().max(160)).max(5),
    feedback: z.string().max(1200),
  })
  .strict();
export type BossRubric = z.infer<typeof BossRubricSchema>;

export const CAPSTONE_DIMENSIONS = [
  'platformKnowledge',
  'dataArchitecture',
  'security',
  'apex',
  'automation',
  'integration',
  'scalability',
  'performance',
  'reliability',
  'observability',
  'tradeOffReasoning',
  'communication',
] as const;
export const CapstoneDimension = z.enum(CAPSTONE_DIMENSIONS);
export type CapstoneDimensionId = (typeof CAPSTONE_DIMENSIONS)[number];

export const CapstoneSchema = z
  .object({
    scores: z
      .object({
        platformKnowledge: Score,
        dataArchitecture: Score,
        security: Score,
        apex: Score,
        automation: Score,
        integration: Score,
        scalability: Score,
        performance: Score,
        reliability: Score,
        observability: Score,
        tradeOffReasoning: Score,
        communication: Score,
      })
      .strict(),
    overall: Score, // advisory; recomputed as round(mean of 12)
    misconceptions: z.array(Misconception).max(12),
    strengths: z.array(z.string().max(200)).max(8),
    gaps: z.array(z.string().max(200)).max(8),
    feedback: z.string().max(2000),
  })
  .strict();
export type CapstoneRubric = z.infer<typeof CapstoneSchema>;

// Stored on attempts.llm_evaluation for bosses: the parsed rubric plus the verdict submitAttempt merged in.
export type StoredBossEvaluation = BossRubric & { defeated: boolean };
export type StoredCapstoneEvaluation = CapstoneRubric & { defeated: boolean };
