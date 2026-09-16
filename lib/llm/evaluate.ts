// Grading orchestrators (ARCHITECTURE.md LLM §A): compose the class system block and the per-question messages,
// call the evaluator, and post-process rubric outputs (boss/capstone `overall` is recomputed as the rounded mean;
// the model's value is advisory). The evaluator is injectable so tests and journeys run against fake.ts.
import 'server-only';
import type { LlmClass } from '../assessments/types.ts';
import { evaluate as liveEvaluate } from './client.ts';
import { LLM_CONFIG } from './config.ts';
import {
  buildMessages,
  buildSystem,
  CAPSTONE_CHALLENGES_TAG,
  CAPSTONE_ROUND1_TAG,
  renderCapstoneChallenges,
  type PromptInput,
} from './prompts.ts';
import {
  BOSS_RUBRIC_KEYS,
  BossRubricSchema,
  CAPSTONE_DIMENSIONS,
  CapstoneSchema,
  EvaluationSchema,
  type BossRubric,
  type CapstoneDimensionId,
  type CapstoneRubric,
  type EvaluationOut,
} from './schemas.ts';
import type { EvaluateResult, Evaluator } from './types.ts';

export interface GraderDeps {
  evaluate: Evaluator;
}

const liveDeps: GraderDeps = { evaluate: liveEvaluate };

/** Lesson exercises reach Claude as `check` or `probe`; bosses and the capstone have their own graders. */
export type ExerciseLlmClass = Extract<LlmClass, 'check' | 'probe'>;

export function roundedMean(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Rule 8: the LLM's `overall` is discarded; overall = round(mean of the six rubric scores). */
export function withBossOverall(rubric: BossRubric): BossRubric {
  return { ...rubric, overall: roundedMean(BOSS_RUBRIC_KEYS.map((k) => rubric[k])) };
}

/** Capstone: overall = round(mean of 12). */
export function withCapstoneOverall(rubric: CapstoneRubric): CapstoneRubric {
  return { ...rubric, overall: roundedMean(CAPSTONE_DIMENSIONS.map((d) => rubric.scores[d])) };
}

/** The lowest-scoring dimensions of a round-1 rubric, ties broken by declaration order (stable sort). */
export function pickChallenges(
  rubric: CapstoneRubric,
  count: number = LLM_CONFIG.capstone.challengeCount,
): CapstoneDimensionId[] {
  return [...CAPSTONE_DIMENSIONS].sort((a, b) => rubric.scores[a] - rubric.scores[b]).slice(0, count);
}

export async function gradeExercise(
  input: { class: ExerciseLlmClass; prompt: PromptInput },
  deps: GraderDeps = liveDeps,
): Promise<EvaluateResult<EvaluationOut>> {
  return deps.evaluate({
    class: input.class,
    schema: EvaluationSchema,
    system: buildSystem(input.class),
    messages: buildMessages(input.prompt),
  });
}

export async function gradeBoss(
  input: { prompt: PromptInput },
  deps: GraderDeps = liveDeps,
): Promise<EvaluateResult<BossRubric>> {
  const result = await deps.evaluate({
    class: 'boss',
    schema: BossRubricSchema,
    system: buildSystem('boss'),
    messages: buildMessages(input.prompt),
  });
  return result.ok ? { ...result, output: withBossOverall(result.output) } : result;
}

export interface CapstoneRound1 {
  /** Advisory only; never stored. */
  rubric: CapstoneRubric;
  /** The dimensions round 2 must defend. */
  challenges: CapstoneDimensionId[];
}

/** Round 1 grades the design alone and picks the challenges; the result is shown, not stored. */
export async function gradeCapstoneRound1(
  input: { prompt: PromptInput },
  deps: GraderDeps = liveDeps,
): Promise<EvaluateResult<CapstoneRound1>> {
  const result = await deps.evaluate({
    class: 'capstone',
    schema: CapstoneSchema,
    system: buildSystem('capstone'),
    messages: buildMessages(input.prompt),
  });
  if (!result.ok) return result;
  const rubric = withCapstoneOverall(result.output);
  return { ...result, output: { rubric, challenges: pickChallenges(rubric) } };
}

export interface CapstoneRound2Input {
  /** Same question context as round 1; `learnerAnswer` is the defence. */
  prompt: PromptInput;
  /** The learner's round-1 design, rendered as untrusted data before the defence. */
  design: string;
  challenges: CapstoneDimensionId[];
}

/** Round 2 ("defend") grades design + defence together; only this result is stored and applied. */
export async function gradeCapstoneRound2(
  input: CapstoneRound2Input,
  deps: GraderDeps = liveDeps,
): Promise<EvaluateResult<CapstoneRubric>> {
  const prompt: PromptInput = {
    ...input.prompt,
    extraContext: [
      ...(input.prompt.extraContext ?? []),
      { tag: CAPSTONE_CHALLENGES_TAG, text: renderCapstoneChallenges(input.challenges) },
    ],
    priorLearnerText: [...(input.prompt.priorLearnerText ?? []), { tag: CAPSTONE_ROUND1_TAG, text: input.design }],
  };
  const result = await deps.evaluate({
    class: 'capstone',
    schema: CapstoneSchema,
    system: buildSystem('capstone'),
    messages: buildMessages(prompt),
  });
  return result.ok ? { ...result, output: withCapstoneOverall(result.output) } : result;
}

/** Supplies the defence text once the round-1 challenges are known. */
export type CapstoneDefence = (round1: CapstoneRound1) => string | Promise<string>;

/** Drives both rounds in one flow; a failed round 1 returns immediately without asking for a defence. */
export async function gradeCapstone(
  round1: { prompt: PromptInput },
  round2: CapstoneDefence,
  deps: GraderDeps = liveDeps,
): Promise<EvaluateResult<CapstoneRubric>> {
  const first = await gradeCapstoneRound1(round1, deps);
  if (!first.ok) return first;
  const defence = await round2(first.output);
  return gradeCapstoneRound2(
    {
      prompt: { ...round1.prompt, learnerAnswer: defence },
      design: round1.prompt.learnerAnswer,
      challenges: first.output.challenges,
    },
    deps,
  );
}
