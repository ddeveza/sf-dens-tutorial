// Concept review outcome from one session's evidence (Engine §7). Pure: plain objects in, a label out.
import type { ScorerKind } from '../assessments/types.ts';
import { BANDS, type Band, type Evaluation } from '../mastery-engine/types.ts';
import { SR_CONFIG, type SrConfig } from './config.ts';
import type { ReviewOutcome } from './types.ts';

// The slice of an attempt the outcome needs. A mastery-engine `Evidence` is assignable as-is; LLM evidence
// must also carry the parsed evaluation, because the review score is min(correctness, understanding), not
// correctness alone. `evaluation` null/absent on LLM evidence means pending_evaluation: it carries no score.
export interface ReviewEvidence {
  scorer: ScorerKind;
  score: number; // deterministic score, or LLM correctness
  evaluation?: Pick<Evaluation, 'correctness' | 'understanding'> | null;
}

export function bandAtLeast(band: Band, min: Band): boolean {
  return BANDS.indexOf(band) >= BANDS.indexOf(min);
}

// `reviewScore = scorer == 'llm' ? min(correctness, understanding) : score`; null when the evidence has no usable score.
export function evidenceReviewScore(evidence: ReviewEvidence): number | null {
  if (evidence.scorer === 'llm') {
    if (!evidence.evaluation) return null;
    return Math.min(evidence.evaluation.correctness, evidence.evaluation.understanding);
  }
  return evidence.score;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Concept outcome score: mean of LLM review scores when any LLM evidence exists, else mean of deterministic scores.
export function reviewScore(evidence: readonly ReviewEvidence[]): number | null {
  const llmScores: number[] = [];
  const deterministicScores: number[] = [];
  for (const item of evidence) {
    const score = evidenceReviewScore(item);
    if (score === null) continue;
    if (item.scorer === 'llm') llmScores.push(score);
    else deterministicScores.push(score);
  }
  const pool = llmScores.length > 0 ? llmScores : deterministicScores;
  return pool.length === 0 ? null : mean(pool);
}

// fail < 40 | struggle 40-69 | strong 70-89, or >= 90 with band below masteredBandMin | mastered >= 90 and band >= strong.
export function outcomeFor(score: number, band: Band, config: SrConfig = SR_CONFIG): ReviewOutcome {
  if (!Number.isFinite(score)) throw new TypeError(`expected a finite review score, got ${score}`);
  const { fail, struggle, strong } = config.outcomeThresholds;
  if (score < fail) return 'fail';
  if (score < struggle) return 'struggle';
  if (score < strong) return 'strong';
  return bandAtLeast(band, config.masteredBandMin) ? 'mastered' : 'strong';
}

// reviewScore + outcomeFor in one call; null when the session produced no usable evidence for the concept.
export function sessionOutcome(evidence: readonly ReviewEvidence[], band: Band, config: SrConfig = SR_CONFIG): ReviewOutcome | null {
  const score = reviewScore(evidence);
  return score === null ? null : outcomeFor(score, band, config);
}
