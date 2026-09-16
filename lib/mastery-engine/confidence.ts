// Confidence signal (Mastery §4 table): self-report, LLM and consistency sources combined with fixed precedence.
import type { MasteryConfig } from './config.ts';
import type { ChainRung, ConfidenceVerdict, SelfConfidence } from './types.ts';

export interface ConfidenceSources {
  correct: boolean; // the answer being judged (score >= correctThreshold)
  selfConfidence: SelfConfidence | null; // attempts.self_confidence
  llm: { understanding: number; confidence: number } | null; // evaluation sub-scores when an LLM graded it
  consistency: {
    recentCorrectDeterministic: number; // correct deterministic answers in the last consistencyWindow attempts
    understandingScore: number | null; // Understanding dimension score, null when unevidenced
    chainRung: ChainRung;
    probesSoFar: number; // probes already run on the concept
  } | null;
}

/** Precedence: suspicious > overconfident > underconfident > calibrated; unknown when no source is present. */
export function confidenceVerdict(sources: ConfidenceSources, config: MasteryConfig): ConfidenceVerdict {
  const { correct, selfConfidence, llm, consistency } = sources;
  const signals = config.confidenceSignals;
  if (selfConfidence === null && llm === null && consistency === null) return 'unknown';

  const llmSuspicious =
    llm !== null && correct && (llm.understanding < config.understandingBands.weak || llm.confidence < signals.llmConfidenceWeak);
  const consistencySuspicious =
    consistency !== null &&
    consistency.recentCorrectDeterministic >= signals.consistencyCorrectMin &&
    ((consistency.understandingScore !== null && consistency.understandingScore < config.understandingBands.weak) ||
      (consistency.chainRung === 0 && consistency.probesSoFar >= 1));
  if (llmSuspicious || consistencySuspicious) return 'suspicious';

  if (selfConfidence !== null && selfConfidence >= signals.selfHighMin && !correct) return 'overconfident';

  const understandingStrong = llm === null || llm.understanding >= config.understandingBands.strong;
  if (selfConfidence !== null && selfConfidence <= signals.selfLowMax && correct && understandingStrong) return 'underconfident';

  return 'calibrated';
}
