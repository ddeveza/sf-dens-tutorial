// Fixture builders shared by the learning-engine tests. Not a test file itself (Vitest collects *.test.ts only).
// Relative `.ts` specifiers: this directory must stay loadable under plain node type stripping.
import { DIMENSIONS } from '../mastery-engine/types.ts';
import type { Dimension, DimensionState, Evidence, MasteryState } from '../mastery-engine/types.ts';
import { initialStepState, STEP_ORDER } from './step-machine.ts';
import type { SessionStep, StepState, StepStatus } from './types.ts';

export const NOW = '2026-09-07T10:00:00.000Z';
export const TODAY = '2026-09-07';
export const TOMORROW = '2026-09-08';
export const LESSON_ID = 'd001-what-is-metadata';

export function dim(over: Partial<DimensionState> = {}): DimensionState {
  return { score: 0, evidenceCount: 0, maxDepthPassed: 0, lastEvidenceAt: null, ...over };
}

export function mastery(
  over: Partial<Omit<MasteryState, 'dims'>> = {},
  dims: Partial<Record<Dimension, Partial<DimensionState>>> = {},
): MasteryState {
  const full = {} as Record<Dimension, DimensionState>;
  for (const d of DIMENSIONS) full[d] = dim(dims[d]);
  return {
    userId: 'user-1',
    conceptId: 'soql.in-loops',
    dims: full,
    overallRaw: 0,
    overall: 0,
    band: 'lost',
    capReason: null,
    consecutiveRecallCorrect: 0,
    chainRung: 0,
    lastProbeAngle: null,
    recentProbeAngles: [],
    recentPassedFormKeys: [],
    recentPassedFormKeyAt: {},
    held: [],
    weakAreas: [],
    updatedAt: NOW,
    ...over,
  };
}

export function evidence(over: Partial<Evidence> = {}): Evidence {
  return {
    attemptId: 'attempt-1',
    conceptId: 'soql.in-loops',
    questionType: 'mcq',
    formKey: 'q-1',
    dimension: 'recall',
    depth: 1,
    score: 100,
    correct: true,
    scorer: 'deterministic',
    selfConfidence: null,
    probeAngle: null,
    chainRung: null,
    durationMs: 20_000,
    at: NOW,
    ...over,
  };
}

export function stepState(step: SessionStep, status: StepStatus = 'locked', over: Partial<StepState> = {}): StepState {
  return { ...initialStepState(LESSON_ID, step, status, { simulator: 'governor-limits' }), ...over };
}

export function stepStates(statusFor: (step: SessionStep, index: number) => StepStatus): StepState[] {
  return STEP_ORDER.map((step, i) => stepState(step, statusFor(step, i)));
}

/** Every step up to and including `through` is completed; the next one is available; the rest locked. */
export function progressedThrough(through: SessionStep | null): StepState[] {
  const idx = through === null ? -1 : STEP_ORDER.indexOf(through);
  return stepStates((_, i) => (i <= idx ? 'completed' : i === idx + 1 ? 'available' : 'locked'));
}
