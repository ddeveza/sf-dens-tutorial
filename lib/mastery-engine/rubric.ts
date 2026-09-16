// Boss and capstone rubrics converted into the Evaluation shape so they reach applyEvaluation like any LLM type.
// The LLM's advisory `overall` is discarded: overall = round(mean of the rubric scores) (LLM §A rule 8).
import { BOSS_RUBRIC_KEYS, CAPSTONE_DIMENSIONS, type BossRubric, type BossRubricKey, type CapstoneRubric } from '../llm/schemas.ts';
import { MASTERY_CONFIG, type MasteryConfig } from './config.ts';
import type { Evaluation } from './types.ts';

function mean(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

const roundedMean = (values: readonly number[]): number => Math.round(mean(values));

export function bossOverall(rubric: Pick<BossRubric, BossRubricKey>): number {
  return roundedMean(BOSS_RUBRIC_KEYS.map((k) => rubric[k]));
}

export function capstoneOverall(capstone: Pick<CapstoneRubric, 'scores'>): number {
  return roundedMean(CAPSTONE_DIMENSIONS.map((k) => capstone.scores[k]));
}

/** Debugging is the primary dimension; understanding / application / architecture land as secondary evidence. */
export function rubricToEvaluation(rubric: BossRubric, config: MasteryConfig = MASTERY_CONFIG): Evaluation {
  const correctness = roundedMean([rubric.dataNeeded, rubric.whatToInspect]);
  return {
    correctness,
    understanding: roundedMean([rubric.suspect, rubric.why]),
    application: rubric.solution,
    architecture: rubric.tradeOffs,
    confidence: bossOverall(rubric),
    masteryDelta: correctness >= config.correctThreshold ? 1 : -1,
    misconceptions: rubric.misconceptions.map((m) => ({ id: m.id, summary: m.summary })),
    nextAction: 'continue',
    feedback: rubric.feedback ?? '',
  };
}

/** Applied once per concept the capstone exercise lists (the caller loops). */
export function capstoneToEvaluation(capstone: CapstoneRubric, config: MasteryConfig = MASTERY_CONFIG): Evaluation {
  const s = capstone.scores;
  const correctness = capstoneOverall(capstone);
  return {
    correctness,
    understanding: roundedMean([s.platformKnowledge, s.security, s.apex, s.automation, s.integration]),
    application: roundedMean([s.reliability, s.observability]),
    architecture: roundedMean([s.dataArchitecture, s.scalability, s.performance, s.tradeOffReasoning]),
    confidence: s.communication,
    masteryDelta: correctness >= config.correctThreshold ? 1 : -1,
    misconceptions: capstone.misconceptions.map((m) => ({ id: m.id, summary: m.summary })),
    nextAction: 'continue',
    feedback: capstone.feedback ?? '',
  };
}
