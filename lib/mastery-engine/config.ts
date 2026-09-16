// Every number the mastery engine uses. Values from ARCHITECTURE.md "Learning Engine and Mastery Model" §2-§4;
// nothing in the engine may carry an inline constant. Relative `.ts` specifiers only (scripts import this under plain node).
import type { QuestionType } from '../learning-engine/types.ts';
import type { ScorerKind } from '../assessments/types.ts';
import type { Band, ChainRung, Depth, Dimension } from './types.ts';

export type UnderstandingBand = 'weak' | 'adequate' | 'strong';

export interface QuestionTypeDefault {
  dimension: Dimension; // primary dimension from the §2 catalog
  depth: Depth; // low end of the §2 depth range; used only when applyEvaluation gets no attempt evidence
}

export interface MasteryConfig {
  dimensionWeights: Record<Dimension, number>;
  bands: Record<Band, { min: number; max: number }>;
  alphaBase: number;
  depthWeight: Record<Depth, number>;
  firstEvidenceCap: Record<ScorerKind, number>;
  maxDelta: Record<QuestionType, number>;
  correctThreshold: number;
  /** understanding < weak => 'weak'; < strong => 'adequate'; else 'strong'. */
  understandingBands: { weak: number; strong: number };
  heldRelease: Record<UnderstandingBand, number>;
  heldExpiryDays: number;
  recallSaturation: number;
  chainGain: Record<ChainRung, number>;
  identicalFormWindowDays: number;
  secondaryWeight: number;
  masteredGate: {
    teachBackMin: number;
    teachBackDepth: Depth;
    appOrDebugDepth: Depth;
    optimizeDepth: Depth;
    designDepth: Depth;
    tradeOffsDepth: Depth;
  };
  minEvidence: { strong: number; mastered: number };
  earlyAdvanceBand: Band;
  /** Deep-Enough level 4 (Apply): the `no_application_or_debugging` cap needs Application or Debugging passed at this depth. */
  applyDepth: Depth;
  /** LLM `challenge` suggestions are honoured only at this band or above (LLM §A rule 6 / Engine §5 rule 7). */
  challengeMinBand: Band;
  /** `recentPassedFormKeys` retention (state comment: "last 20 form keys answered correctly"). */
  recentFormKeysMax: number;
  /** `recentProbeAngles` retention; mirrors PROBE_CONFIG.probeAngleRepeatWindow so the mastery state stays self-contained. */
  recentProbeAnglesMax: number;
  /** Thresholds of the §4 confidence-signal table. */
  confidenceSignals: {
    selfHighMin: number; // self-report >= this and wrong => overconfident
    selfLowMax: number; // self-report <= this and correct (understanding strong or no LLM data) => underconfident
    llmConfidenceWeak: number; // evaluation.confidence below this on a correct answer => suspicious
    consistencyCorrectMin: number; // >= this many correct deterministic answers in the window => consistency check applies
  };
  questionTypeDefaults: Record<QuestionType, QuestionTypeDefault>;
}

export const MASTERY_CONFIG: MasteryConfig = {
  dimensionWeights: {
    recall: 0.1,
    understanding: 0.25,
    application: 0.2,
    debugging: 0.15,
    architecture: 0.15,
    teach_back: 0.15,
  },
  bands: {
    lost: { min: 0, max: 39 },
    familiar: { min: 40, max: 59 },
    developing: { min: 60, max: 74 },
    competent: { min: 75, max: 84 },
    strong: { min: 85, max: 94 },
    mastered: { min: 95, max: 100 },
  },
  alphaBase: 0.25,
  depthWeight: { 1: 0.5, 2: 0.65, 3: 0.8, 4: 1.0, 5: 1.1, 6: 1.2, 7: 1.3, 8: 1.4 },
  firstEvidenceCap: { deterministic: 50, llm: 85 },
  maxDelta: {
    mcq: 8,
    multi_select: 8,
    true_false: 5,
    predict_outcome: 12,
    debug_code: 15,
    order_execution: 12,
    find_anti_pattern: 12,
    explain_why: 20,
    compare_approaches: 20,
    architecture_decision: 25,
    fix_design: 25,
    scenario_diagnosis: 25,
    teach_back: 30,
    lab: 12, // deterministic hands-on run (Data Model §1); absent from the §2 table, aligned with predict_outcome
    boss: 25,
    capstone: 30,
  },
  correctThreshold: 70,
  understandingBands: { weak: 50, strong: 70 },
  heldRelease: { strong: 1.0, adequate: 0.5, weak: 0.1 },
  heldExpiryDays: 7,
  recallSaturation: 3,
  chainGain: { 0: 0.5, 1: 0.75, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0 },
  identicalFormWindowDays: 30,
  secondaryWeight: 0.5,
  masteredGate: {
    teachBackMin: 80,
    teachBackDepth: 5,
    appOrDebugDepth: 5,
    optimizeDepth: 6,
    designDepth: 7,
    tradeOffsDepth: 8,
  },
  minEvidence: { strong: 6, mastered: 10 },
  earlyAdvanceBand: 'competent',
  applyDepth: 4,
  challengeMinBand: 'developing',
  recentFormKeysMax: 20,
  recentProbeAnglesMax: 3,
  confidenceSignals: {
    selfHighMin: 4,
    selfLowMax: 2,
    llmConfidenceWeak: 40,
    consistencyCorrectMin: 3,
  },
  questionTypeDefaults: {
    mcq: { dimension: 'recall', depth: 1 },
    multi_select: { dimension: 'recall', depth: 1 },
    true_false: { dimension: 'recall', depth: 1 },
    predict_outcome: { dimension: 'application', depth: 3 },
    order_execution: { dimension: 'understanding', depth: 2 },
    debug_code: { dimension: 'debugging', depth: 4 },
    find_anti_pattern: { dimension: 'debugging', depth: 3 },
    explain_why: { dimension: 'understanding', depth: 2 },
    compare_approaches: { dimension: 'architecture', depth: 5 },
    architecture_decision: { dimension: 'architecture', depth: 6 },
    fix_design: { dimension: 'architecture', depth: 5 },
    scenario_diagnosis: { dimension: 'debugging', depth: 5 },
    teach_back: { dimension: 'teach_back', depth: 2 },
    lab: { dimension: 'application', depth: 4 },
    boss: { dimension: 'debugging', depth: 7 },
    capstone: { dimension: 'architecture', depth: 8 },
  },
};
