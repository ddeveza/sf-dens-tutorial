// Test-only builders for the mastery engine. Not a test file itself (Vitest collects *.test.ts only).
import type { Depth, Dimension, DimensionState, Evaluation, Evidence, MasteryState } from './types.ts';
import { createMasteryState } from './state.ts';
import { recompute } from './caps.ts';
import { MASTERY_CONFIG } from './config.ts';

export const NOW = '2026-09-07T10:00:00.000Z';
export const USER = '00000000-0000-0000-0000-000000000001';
export const CONCEPT = 'soql-in-loops';

export interface DimSpec {
  score: number;
  n?: number;
  depth?: Depth | 0;
}

export function dim(score: number, n = 1, depth: Depth | 0 = 0, lastEvidenceAt: string | null = NOW): DimensionState {
  return { score, evidenceCount: n, maxDepthPassed: depth, lastEvidenceAt };
}

/** Builds a recomputed state whose listed dimensions carry evidence; unlisted dimensions stay unevidenced. */
export function stateWith(
  dims: Partial<Record<Dimension, DimSpec>>,
  extra: Partial<MasteryState> = {},
  now: string = NOW,
): MasteryState {
  const base = createMasteryState(USER, CONCEPT, now);
  for (const [name, spec] of Object.entries(dims) as Array<[Dimension, DimSpec]>) {
    const depth: Depth | 0 = spec.depth ?? (spec.score >= MASTERY_CONFIG.correctThreshold ? 1 : 0);
    base.dims[name] = dim(spec.score, spec.n ?? 1, depth, now);
  }
  return recompute({ ...base, ...extra }, MASTERY_CONFIG);
}

export function mcq(overrides: Partial<Evidence> = {}): Evidence {
  return {
    attemptId: 'a-mcq',
    conceptId: CONCEPT,
    questionType: 'mcq',
    formKey: 'q1',
    dimension: 'recall',
    depth: 1,
    score: 100,
    correct: true,
    scorer: 'deterministic',
    selfConfidence: null,
    probeAngle: null,
    chainRung: null,
    durationMs: 12_000,
    at: NOW,
    ...overrides,
  };
}

export function llmEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    attemptId: 'a-llm',
    conceptId: CONCEPT,
    questionType: 'explain_why',
    formKey: 'probe-why-1',
    dimension: 'understanding',
    depth: 2,
    score: 80,
    correct: true,
    scorer: 'llm',
    selfConfidence: null,
    probeAngle: null,
    chainRung: null,
    durationMs: 60_000,
    at: NOW,
    ...overrides,
  };
}

export function evaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    correctness: 80,
    understanding: 80,
    application: 70,
    architecture: 60,
    confidence: 75,
    masteryDelta: 3,
    misconceptions: [],
    nextAction: 'continue',
    feedback: '',
    ...overrides,
  };
}
