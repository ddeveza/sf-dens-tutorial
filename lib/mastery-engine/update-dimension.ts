// Per-dimension EMA update (Mastery §3 formula). Pure: one DimensionState in, one delta out.
import type { QuestionType } from '../learning-engine/types.ts';
import type { ScorerKind } from '../assessments/types.ts';
import type { MasteryConfig } from './config.ts';
import type { ChainRung, Depth, Dimension, DimensionState } from './types.ts';

export type DeltaSuppression = 'identical_form' | 'recall_saturated' | 'correctness_floor' | 'sign_gate' | 'suspicious' | null;

export interface DimensionEvidence {
  dimension: Dimension; // the dimension being updated (recall saturation reads it)
  target: number; // 0-100 score the EMA moves toward
  depth: Depth;
  questionType: QuestionType; // maxDelta key
  scorer: ScorerKind;
  formKey: string;
  secondary?: boolean; // LLM sub-score routed to an already-evidenced dimension: gain x secondaryWeight
  llm?: { correctness: number; masteryDelta: number } | null; // LLM gates (correctness floor, sign gate)
  context: {
    chainRung: ChainRung;
    consecutiveRecallCorrect: number;
    recentPassedFormKeys: readonly string[]; // already narrowed to identicalFormWindowDays by the caller
  };
}

export interface DimensionDelta {
  before: number;
  after: number; // clamp(round(before + delta), 0, 100)
  delta: number; // applied (possibly fractional) delta after clamps and suppression
  raw: number; // formula output before the clamp
  suppressed: DeltaSuppression;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function updateDimension(dim: DimensionState, evidence: DimensionEvidence, config: MasteryConfig): DimensionDelta {
  const n = dim.evidenceCount;
  const target = clamp(evidence.target, 0, 100);
  const depthWeight = config.depthWeight[evidence.depth];
  const deterministic = evidence.scorer === 'deterministic';

  let raw: number;
  let delta: number;
  if (n === 0) {
    // First evidence sets the level. Secondary evidence never lands on an unevidenced dimension (caller guards);
    // if it does, it must not create a level either.
    raw = evidence.secondary ? 0 : target * depthWeight;
    delta = Math.min(raw, config.firstEvidenceCap[evidence.scorer]);
  } else {
    const alpha = Math.max(config.alphaBase, 1 / (n + 1));
    const diff = target - dim.score;
    const positive = diff > 0;
    let gain = alpha * depthWeight * (positive && deterministic ? config.chainGain[evidence.context.chainRung] : 1);
    if (evidence.secondary) gain *= config.secondaryWeight;
    raw = gain * diff;
    const max = config.maxDelta[evidence.questionType];
    delta = clamp(raw, -max, max);
  }

  let suppressed: DeltaSuppression = null;
  if (delta > 0) {
    const llm = evidence.scorer === 'llm' ? (evidence.llm ?? null) : null;
    if (evidence.context.recentPassedFormKeys.includes(evidence.formKey)) suppressed = 'identical_form';
    else if (evidence.dimension === 'recall' && evidence.context.consecutiveRecallCorrect >= config.recallSaturation)
      suppressed = 'recall_saturated';
    else if (llm && llm.correctness < config.correctThreshold) suppressed = 'correctness_floor';
    else if (llm && Math.sign(llm.masteryDelta) !== 1) suppressed = 'sign_gate';
    if (suppressed) delta = 0;
  }

  const after = clamp(Math.round(dim.score + delta), 0, 100);
  return { before: dim.score, after, delta, raw, suppressed };
}
