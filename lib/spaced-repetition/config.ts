// Spaced-repetition configuration (ARCHITECTURE.md Engine §7). Every number and every table the engine reads
// lives here, never inline. Relative `.ts` specifiers only: this file is imported transitively by data/** and
// scripts/** under plain `node` type stripping (no `@/`, no enums).
import type { ScorerKind } from '../assessments/types.ts';
import type { ProbeAngle, QuestionType } from '../learning-engine/types.ts';
import type { Band, Depth, Dimension } from '../mastery-engine/types.ts';
import type { IntervalDays } from './types.ts';

export interface DepthRange {
  readonly min: Depth;
  readonly max: Depth;
}

// Scorer and Deep-Enough depth range of a question type, mirrored from the Engine §2 catalog for the
// review-eligible types (boss, capstone and lab are never generated as reviews and are deliberately absent).
export interface ReviewQuestionTypeSpec {
  readonly scorer: ScorerKind;
  readonly depth: DepthRange;
}

// Engine §4 probe-angle catalog: the dimension an angle evidences, the question types it can be asked as
// (in preference order) and the depth range its templates target.
export interface ProbeAngleSpec {
  readonly dimension: Dimension;
  readonly questionTypes: readonly QuestionType[];
  readonly depth: DepthRange;
}

export interface SrConfig {
  // Days until the next review per outcome; `mastered` is [first, repeat]: 21, then 30 once a 21-day hold was mastered again.
  readonly intervals: {
    readonly fail: IntervalDays;
    readonly struggle: IntervalDays;
    readonly strong: IntervalDays;
    readonly mastered: readonly [IntervalDays, IntervalDays];
  };
  // Exclusive upper bounds: score < fail => 'fail', < struggle => 'struggle', < strong => 'strong', else mastered-eligible.
  readonly outcomeThresholds: { readonly fail: number; readonly struggle: number; readonly strong: number };
  // A score at or above `outcomeThresholds.strong` is 'mastered' only when the concept band is at least this band.
  readonly masteredBandMin: Band;
  // A dimension scoring below this is "weak": the generated item carries reason 'weak_dimension'.
  readonly weakDimensionThreshold: number;
  readonly warmupReviewMax: number;
  readonly reviewSessionMax: number;
  // Review debt (count of dueOn <= todayLocal) at or above which the dashboard and the reminder email nudge.
  readonly reviewDebtNudge: number;
  // After `afterLapses` lapses the ladder restarts: intervals are capped at `maxIntervalDays` until a strong-or-better outcome is on record.
  readonly lapseLadderReset: { readonly afterLapses: number; readonly maxIntervalDays: IntervalDays };
  // Sessions idle longer than this are closed by the daily cron sweep, which then computes the concept outcome.
  readonly abandonedSessionHours: number;
  // Interval for items that have no outcome yet (fresh, failed_attempt, skipped_with_gap): due tomorrow.
  readonly newItemIntervalDays: IntervalDays;
  // `next_mission` with a gap creates a review item for every lesson concept whose band is below this band.
  readonly skippedGapBandBelow: Band;
  // Minimum of DIFFICULTY_CONFIG.bandDepthWindow per band; review depth = max(windowMin, maxDepthPassed).
  readonly bandDepthWindowMin: Readonly<Record<Band, Depth>>;
  // Dimension targeted when the concept has no evidenced dimension yet.
  readonly defaultDimension: Dimension;
  // Scorer kind of the first review of a concept; consecutive reviews alternate from there (LLM cost).
  readonly firstReviewScorer: ScorerKind;
  readonly questionTypes: Readonly<Partial<Record<QuestionType, ReviewQuestionTypeSpec>>>;
  // Question types that may evidence each dimension (Engine §2 primary + "also allowed"), primary types first.
  readonly reviewQuestionTypes: Readonly<Record<Dimension, readonly QuestionType[]>>;
  readonly probeAngles: Readonly<Record<ProbeAngle, ProbeAngleSpec>>;
}

export const SR_CONFIG: SrConfig = {
  intervals: { fail: 1, struggle: 3, strong: 7, mastered: [21, 30] },
  outcomeThresholds: { fail: 40, struggle: 70, strong: 90 },
  masteredBandMin: 'strong',
  weakDimensionThreshold: 60,
  warmupReviewMax: 3,
  reviewSessionMax: 5,
  reviewDebtNudge: 5,
  lapseLadderReset: { afterLapses: 2, maxIntervalDays: 3 },
  abandonedSessionHours: 12,
  newItemIntervalDays: 1,
  skippedGapBandBelow: 'developing',
  bandDepthWindowMin: { lost: 1, familiar: 2, developing: 3, competent: 4, strong: 5, mastered: 7 },
  defaultDimension: 'understanding',
  firstReviewScorer: 'deterministic',
  questionTypes: {
    mcq: { scorer: 'deterministic', depth: { min: 1, max: 4 } },
    multi_select: { scorer: 'deterministic', depth: { min: 1, max: 4 } },
    true_false: { scorer: 'deterministic', depth: { min: 1, max: 3 } },
    predict_outcome: { scorer: 'deterministic', depth: { min: 3, max: 5 } },
    order_execution: { scorer: 'deterministic', depth: { min: 2, max: 5 } },
    debug_code: { scorer: 'deterministic', depth: { min: 4, max: 6 } },
    find_anti_pattern: { scorer: 'deterministic', depth: { min: 3, max: 6 } },
    explain_why: { scorer: 'llm', depth: { min: 2, max: 5 } },
    compare_approaches: { scorer: 'llm', depth: { min: 5, max: 8 } },
    architecture_decision: { scorer: 'llm', depth: { min: 6, max: 8 } },
    fix_design: { scorer: 'llm', depth: { min: 5, max: 7 } },
    scenario_diagnosis: { scorer: 'llm', depth: { min: 5, max: 8 } },
    teach_back: { scorer: 'llm', depth: { min: 2, max: 8 } },
  },
  reviewQuestionTypes: {
    recall: ['mcq', 'multi_select', 'true_false', 'explain_why'],
    understanding: ['order_execution', 'explain_why', 'mcq', 'multi_select', 'predict_outcome', 'compare_approaches', 'teach_back'],
    application: ['predict_outcome', 'mcq', 'order_execution', 'debug_code', 'find_anti_pattern', 'explain_why'],
    debugging: ['debug_code', 'find_anti_pattern', 'scenario_diagnosis', 'fix_design', 'explain_why'],
    architecture: ['compare_approaches', 'architecture_decision', 'fix_design', 'scenario_diagnosis', 'explain_why'],
    teach_back: ['teach_back'],
  },
  probeAngles: {
    why: { dimension: 'understanding', questionTypes: ['explain_why'], depth: { min: 2, max: 2 } },
    what_if: { dimension: 'application', questionTypes: ['explain_why'], depth: { min: 3, max: 4 } },
    what_breaks: { dimension: 'debugging', questionTypes: ['explain_why', 'scenario_diagnosis'], depth: { min: 5, max: 5 } },
    what_would_you_change: { dimension: 'architecture', questionTypes: ['fix_design'], depth: { min: 6, max: 7 } },
    explain_without_jargon: { dimension: 'understanding', questionTypes: ['teach_back'], depth: { min: 2, max: 2 } },
    explain_to_junior: { dimension: 'teach_back', questionTypes: ['teach_back'], depth: { min: 2, max: 5 } },
    predict: { dimension: 'application', questionTypes: ['predict_outcome'], depth: { min: 3, max: 3 } },
  },
};
