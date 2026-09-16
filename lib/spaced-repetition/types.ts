import type { Depth, Dimension } from '../mastery-engine/types.ts';
import type { ProbeAngle, QuestionType } from '../learning-engine/types.ts';

export const REVIEW_OUTCOMES = ['fail', 'struggle', 'strong', 'mastered'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export const REVIEW_REASONS = ['weak_dimension', 'failed_attempt', 'skipped_with_gap', 'scheduled'] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const INTERVAL_DAYS = [1, 3, 7, 21, 30] as const;
export type IntervalDays = (typeof INTERVAL_DAYS)[number];

export interface ReviewItem {
  id: string;
  userId: string;
  conceptId: string;
  dimension: Dimension;
  depth: Depth;
  questionType: QuestionType;
  angle: ProbeAngle | null;
  excludeFormKeys: string[];
  dueOn: string; // YYYY-MM-DD, learner-local calendar date
  intervalDays: IntervalDays;
  lastOutcome: ReviewOutcome | null;
  reviewCount: number;
  lapses: number;
  reason: ReviewReason;
}
