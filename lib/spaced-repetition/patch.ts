// The DB-facing shape of a review item. `ReviewPatch` is the `reviewPatches[]` element `record_attempt` upserts
// through `jsonb_populate_recordset(null::review_items, ...)`: snake_case, exactly the writable columns
// (id, user_id and timestamps are the function's). `ReviewItemDraft` is a ReviewItem before its first upsert
// (no uuid yet); scheduling and generation are generic over it so a persisted ReviewItem round-trips unchanged.
import type { ProbeAngle, QuestionType } from '../learning-engine/types.ts';
import type { Depth, Dimension } from '../mastery-engine/types.ts';
import type { IntervalDays, ReviewItem, ReviewOutcome, ReviewReason } from './types.ts';

export type ReviewItemDraft = Omit<ReviewItem, 'id'> & { id?: string };

export interface ReviewPatch {
  concept_id: string;
  dimension: Dimension;
  depth: Depth;
  question_type: QuestionType;
  angle: ProbeAngle | null;
  exclude_form_keys: string[];
  due_on: string; // YYYY-MM-DD learner-local date
  interval_days: IntervalDays;
  last_outcome: ReviewOutcome | null;
  review_count: number;
  lapses: number;
  reason: ReviewReason;
}

export function toReviewPatch(item: Omit<ReviewItem, 'id' | 'userId'>): ReviewPatch {
  return {
    concept_id: item.conceptId,
    dimension: item.dimension,
    depth: item.depth,
    question_type: item.questionType,
    angle: item.angle,
    exclude_form_keys: [...item.excludeFormKeys],
    due_on: item.dueOn,
    interval_days: item.intervalDays,
    last_outcome: item.lastOutcome,
    review_count: item.reviewCount,
    lapses: item.lapses,
    reason: item.reason,
  };
}
