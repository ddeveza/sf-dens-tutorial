// Review generation from weakness (Engine §7): target the weakest evidenced dimension at
// depth = max(windowMin, maxDepthPassed), at an angle not recently used, excluding recently passed question
// forms, alternating deterministic and LLM question types across consecutive reviews of the same concept.
// Never replays a question: the item describes what to ask; the picker resolves it against templates/pool.
import type { ScorerKind } from '../assessments/types.ts';
import type { ProbeAngle, QuestionType } from '../learning-engine/types.ts';
import { DEPTHS, DIMENSIONS, type Depth, type Dimension, type MasteryState } from '../mastery-engine/types.ts';
import { SR_CONFIG, type DepthRange, type ReviewQuestionTypeSpec, type SrConfig } from './config.ts';
import { addDays, parseLocalDate } from './dates.ts';
import { bandAtLeast } from './outcome.ts';
import { toReviewPatch, type ReviewItemDraft, type ReviewPatch } from './patch.ts';
import type { ReviewReason } from './types.ts';

// What the generator needs from the curriculum concept: its slug (= concepts.id = MasteryState.conceptId) and
// the probe angles that have at least one template (`defineConcept({ probes })` keys with a non-empty list).
export interface ReviewConcept {
  slug: string;
  probeAngles: readonly ProbeAngle[];
}

export interface GeneratedReview {
  item: ReviewItemDraft;
  reviewPatch: ReviewPatch;
}

export interface ReviewQuestionChoice {
  questionType: QuestionType;
  angle: ProbeAngle | null; // null = pick from the lesson pool instead of a probe template
}

type ScheduleFields = Pick<ReviewItemDraft, 'dueOn' | 'intervalDays' | 'lastOutcome' | 'reviewCount' | 'lapses'>;

// Scorer kind of a question type per the review catalog; null for types reviews never generate (boss, capstone, lab).
export function scorerOf(questionType: QuestionType, config: SrConfig = SR_CONFIG): ScorerKind | null {
  return config.questionTypes[questionType]?.scorer ?? null;
}

function specOf(questionType: QuestionType, config: SrConfig): ReviewQuestionTypeSpec {
  const spec = config.questionTypes[questionType];
  if (!spec) throw new Error(`question type "${questionType}" is not in SR_CONFIG.questionTypes`);
  return spec;
}

// Lowest score among dimensions with primary evidence; ties break in DIMENSIONS order; `defaultDimension` if none.
export function weakestEvidencedDimension(state: MasteryState, config: SrConfig = SR_CONFIG): Dimension {
  let weakest: Dimension | null = null;
  let weakestScore = Number.POSITIVE_INFINITY;
  for (const dimension of DIMENSIONS) {
    const dim = state.dims[dimension];
    if (dim.evidenceCount < 1) continue;
    if (dim.score < weakestScore) {
      weakest = dimension;
      weakestScore = dim.score;
    }
  }
  return weakest ?? config.defaultDimension;
}

function clampDepth(value: number): Depth {
  const min = DEPTHS[0];
  const max = DEPTHS[DEPTHS.length - 1];
  return Math.min(max, Math.max(min, Math.round(value))) as Depth;
}

// depth = max(windowMin[band], maxDepthPassed of the target dimension)
export function reviewDepthFor(state: MasteryState, dimension: Dimension, config: SrConfig = SR_CONFIG): Depth {
  return clampDepth(Math.max(config.bandDepthWindowMin[state.band], state.dims[dimension].maxDepthPassed));
}

function contains(range: DepthRange, depth: Depth): boolean {
  return depth >= range.min && depth <= range.max;
}

// First candidate whose depth range contains `depth`, else the first candidate (DIFFICULTY_CONFIG fallback spirit).
function preferDepthFit<T>(candidates: readonly T[], rangeOf: (candidate: T) => DepthRange, depth: Depth): T | null {
  if (candidates.length === 0) return null;
  return candidates.find((candidate) => contains(rangeOf(candidate), depth)) ?? candidates[0];
}

function typesOfKind(types: readonly QuestionType[], scorer: ScorerKind, config: SrConfig): QuestionType[] {
  return types.filter((type) => scorerOf(type, config) === scorer);
}

// Picks {questionType, angle} for a dimension at a depth. Angle-driven first (a template at an unused angle is a
// genuinely new question), then the dimension's pool types with no angle; the wanted scorer kind first, the other
// kind only when the wanted kind has nothing to offer for this dimension.
export function chooseReviewQuestion(
  dimension: Dimension,
  depth: Depth,
  wanted: ScorerKind,
  availableAngles: readonly ProbeAngle[],
  config: SrConfig = SR_CONFIG,
): ReviewQuestionChoice {
  const anglesForDimension = availableAngles.filter((angle) => config.probeAngles[angle].dimension === dimension);

  const byKind = (scorer: ScorerKind): ReviewQuestionChoice | null => {
    const anglesOfKind = anglesForDimension.filter((angle) => typesOfKind(config.probeAngles[angle].questionTypes, scorer, config).length > 0);
    const angle = preferDepthFit(anglesOfKind, (candidate) => config.probeAngles[candidate].depth, depth);
    if (angle) {
      const types = typesOfKind(config.probeAngles[angle].questionTypes, scorer, config);
      const questionType = preferDepthFit(types, (type) => specOf(type, config).depth, depth);
      if (questionType) return { questionType, angle };
    }
    const pool = typesOfKind(config.reviewQuestionTypes[dimension], scorer, config);
    const questionType = preferDepthFit(pool, (type) => specOf(type, config).depth, depth);
    return questionType ? { questionType, angle: null } : null;
  };

  const other: ScorerKind = wanted === 'llm' ? 'deterministic' : 'llm';
  const choice = byKind(wanted) ?? byKind(other);
  if (!choice) throw new Error(`no review question type configured for dimension "${dimension}"`);
  return choice;
}

function freshSchedule(todayLocal: string, previousItem: ReviewItemDraft | null, config: SrConfig): ScheduleFields {
  return {
    dueOn: addDays(todayLocal, config.newItemIntervalDays),
    intervalDays: config.newItemIntervalDays,
    lastOutcome: previousItem?.lastOutcome ?? null,
    reviewCount: previousItem?.reviewCount ?? 0,
    lapses: previousItem?.lapses ?? 0,
  };
}

function carriedSchedule(previousItem: ReviewItemDraft): ScheduleFields {
  return {
    dueOn: previousItem.dueOn,
    intervalDays: previousItem.intervalDays,
    lastOutcome: previousItem.lastOutcome,
    reviewCount: previousItem.reviewCount,
    lapses: previousItem.lapses,
  };
}

function buildReview(
  state: MasteryState,
  concept: ReviewConcept,
  previousItem: ReviewItemDraft | null,
  todayLocal: string,
  config: SrConfig,
  forcedReason: ReviewReason | null,
): GeneratedReview {
  parseLocalDate(todayLocal);
  if (concept.slug !== state.conceptId) {
    throw new Error(`concept "${concept.slug}" does not match the mastery state for concept "${state.conceptId}"`);
  }
  if (previousItem && (previousItem.userId !== state.userId || previousItem.conceptId !== state.conceptId)) {
    throw new Error(`previous review item belongs to (${previousItem.userId}, ${previousItem.conceptId}), not (${state.userId}, ${state.conceptId})`);
  }

  const dimension = weakestEvidencedDimension(state, config);
  const depth = reviewDepthFor(state, dimension, config);

  const blockedAngles = new Set<ProbeAngle>(state.recentProbeAngles);
  if (previousItem?.angle) blockedAngles.add(previousItem.angle);
  const availableAngles = concept.probeAngles.filter((angle) => !blockedAngles.has(angle));

  const previousScorer = previousItem ? scorerOf(previousItem.questionType, config) : null;
  const wanted: ScorerKind = previousScorer === null ? config.firstReviewScorer : previousScorer === 'llm' ? 'deterministic' : 'llm';
  const { questionType, angle } = chooseReviewQuestion(dimension, depth, wanted, availableAngles, config);

  const weak = state.dims[dimension].score < config.weakDimensionThreshold;
  const reason: ReviewReason = forcedReason ?? (weak ? 'weak_dimension' : 'scheduled');
  const schedule = forcedReason !== null || previousItem === null ? freshSchedule(todayLocal, previousItem, config) : carriedSchedule(previousItem);

  const item: ReviewItemDraft = {
    ...(previousItem?.id !== undefined ? { id: previousItem.id } : {}),
    userId: state.userId,
    conceptId: state.conceptId,
    dimension,
    depth,
    questionType,
    angle,
    excludeFormKeys: [...new Set(state.recentPassedFormKeys)],
    ...schedule,
    reason,
  };
  return { item, reviewPatch: toReviewPatch(item) };
}

// The regular path: on lesson close or after a review, describe the next review of this concept. With a
// `previousItem` the schedule (dueOn, intervalDays, lastOutcome, reviewCount, lapses) is carried over, so call
// `scheduleReview` before or after this; without one the item is a fresh draft due tomorrow.
export function generateReviewItem(
  state: MasteryState,
  concept: ReviewConcept,
  previousItem: ReviewItemDraft | null,
  todayLocal: string,
  config: SrConfig = SR_CONFIG,
): GeneratedReview {
  return buildReview(state, concept, previousItem, todayLocal, config, null);
}

// Second consecutive failure on the concept (`targeted_review`): due tomorrow, history kept from any live item.
export function createReviewItemForFailure(
  state: MasteryState,
  concept: ReviewConcept,
  previousItem: ReviewItemDraft | null,
  todayLocal: string,
  config: SrConfig = SR_CONFIG,
): GeneratedReview {
  return buildReview(state, concept, previousItem, todayLocal, config, 'failed_attempt');
}

// `next_mission` with a gap: every lesson concept below `skippedGapBandBelow` gets one of these, due tomorrow.
export function createReviewItemForSkippedGap(
  state: MasteryState,
  concept: ReviewConcept,
  previousItem: ReviewItemDraft | null,
  todayLocal: string,
  config: SrConfig = SR_CONFIG,
): GeneratedReview {
  return buildReview(state, concept, previousItem, todayLocal, config, 'skipped_with_gap');
}

export function shouldCreateSkippedGapItem(state: MasteryState, config: SrConfig = SR_CONFIG): boolean {
  return !bandAtLeast(state.band, config.skippedGapBandBelow);
}
