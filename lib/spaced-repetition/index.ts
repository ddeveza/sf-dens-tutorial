// Public surface of the spaced-repetition engine. Pure: no IO, no env, no clock; callers pass `todayLocal`.
export { SR_CONFIG } from './config.ts';
export type { DepthRange, ProbeAngleSpec, ReviewQuestionTypeSpec, SrConfig } from './config.ts';

export {
  addDays,
  civilToDayNumber,
  compareDates,
  dayNumberToCivil,
  daysInMonth,
  diffDays,
  formatLocalDate,
  fromDayNumber,
  isLeapYear,
  isLocalDate,
  parseLocalDate,
  toDayNumber,
} from './dates.ts';
export type { CivilDate } from './dates.ts';

export { toReviewPatch } from './patch.ts';
export type { ReviewItemDraft, ReviewPatch } from './patch.ts';

export { bandAtLeast, evidenceReviewScore, outcomeFor, reviewScore, sessionOutcome } from './outcome.ts';
export type { ReviewEvidence } from './outcome.ts';

export { countsAsLapse, isHeldOutcome, nextInterval, scheduleReview, upsertReviewItem } from './schedule.ts';
export type { ScheduledReview } from './schedule.ts';

export {
  chooseReviewQuestion,
  createReviewItemForFailure,
  createReviewItemForSkippedGap,
  generateReviewItem,
  reviewDepthFor,
  scorerOf,
  shouldCreateSkippedGapItem,
  weakestEvidencedDimension,
} from './generate.ts';
export type { GeneratedReview, ReviewConcept, ReviewQuestionChoice } from './generate.ts';

export { dueItems, isDue, isOverdue, needsReviewNudge, reviewDebt, reviewSessionSelection, warmupSelection } from './debt.ts';
export type { DueItem, SelectableItem } from './debt.ts';

export { INTERVAL_DAYS, REVIEW_OUTCOMES, REVIEW_REASONS } from './types.ts';
export type { IntervalDays, ReviewItem, ReviewOutcome, ReviewReason } from './types.ts';
