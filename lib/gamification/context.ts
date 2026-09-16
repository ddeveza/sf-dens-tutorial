// Plain, serialisable input rows for every lib/gamification engine. db/queries/gamification.ts (and
// db/queries/dashboard.ts) map Supabase rows onto these shapes; nothing here touches IO.
// Relative `.ts` specifiers only: scripts/** may import the catalog transitively under plain node.
import type { AttemptKind, AttemptStatus } from '../assessments/types.ts';
import type { FlexAction, LessonStatus, ProbeAngle, QuestionType, Segment } from '../learning-engine/types.ts';
import type { Band, Depth, Dimension, DimensionScores } from '../mastery-engine/types.ts';
import type { ReviewItem } from '../spaced-repetition/types.ts';
import type { BossKind, SkillId, XpReason } from './types.ts';

export type LessonKind = 'lesson' | 'lab' | 'side_quest' | 'boss' | 'capstone';
export type LessonVisibility = 'core' | 'side' | 'hidden';

/** One `attempts` row (camelCase). `answer` and `llmEvaluation` are the raw jsonb columns. */
export interface AttemptRow {
  id: number;
  kind: AttemptKind;
  questionType: QuestionType;
  lessonSlug: string | null;
  conceptId: string | null; // null for boss / capstone: they fan out over conceptIds
  conceptIds: string[];
  exerciseId: string | null;
  formKey: string;
  dimension: Dimension | null;
  depth: Depth;
  score: number | null;
  correct: boolean | null;
  passed: boolean | null;
  selfConfidence: number | null; // 1-5
  probeAngle: ProbeAngle | null;
  reviewItemId: string | null;
  bossKind: BossKind | null;
  bossRef: string | null;
  answer: unknown;
  llmEvaluation: unknown; // parsed EvaluationSchema / BossRubricSchema / CapstoneSchema (+ `defeated` for bosses)
  misconceptionIds: string[];
  status: AttemptStatus;
  durationMs: number;
  localDate: string; // YYYY-MM-DD stamped in profiles.time_zone at write time
  createdAt: string; // ISO
}

/** One `xp_transactions` row. */
export interface XpTransactionRow {
  id: number;
  attemptId: number | null;
  reason: XpReason;
  ref: string | null;
  base: number;
  multiplier: number;
  amount: number;
  localDate: string;
  createdAt: string;
}

/** One `mastery` row; `evidenceByDimension` comes from `state.dims[d].evidenceCount`. */
export interface MasteryRow {
  conceptId: string;
  scores: DimensionScores;
  overall: number;
  band: Band;
  evidenceCount: number;
  evidenceByDimension: Record<Dimension, number>;
  updatedAt: string;
}

export type ReviewItemRow = Pick<ReviewItem, 'id' | 'conceptId' | 'dueOn' | 'lapses' | 'reviewCount' | 'reason'>;

export interface LessonProgressRow {
  lessonSlug: string;
  status: LessonStatus;
  completedAt: string | null;
  updatedAt: string;
}

// Curriculum registry rows (worlds / missions / lessons / concepts / weekly templates), as synced by scripts/sync-curriculum.ts.
export interface WorldRow {
  slug: string;
  ordinal: number;
  title: string;
  skill: SkillId;
}

export interface MissionRow {
  slug: string;
  worldSlug: string;
  ordinal: number;
  title: string;
  bossLessonSlug: string | null;
}

export interface LessonRow {
  slug: string;
  day: number | null; // null only for content without a calendar day (weekly templates never appear here)
  kind: LessonKind;
  visibility: LessonVisibility;
  missionSlug: string;
  ordinal: number;
  title: string;
  concepts: string[]; // lesson_concepts, primary first
}

export interface ConceptRow {
  slug: string;
  parentSlug: string | null;
  worldSlug: string;
  title: string;
  skills: Partial<Record<SkillId, number>>; // concept_skills weights (sum to 1)
  importance: number; // relative weight inside skill bars and parent aggregates; 1 when the registry carries none
}

export interface WeeklyTemplateRow {
  id: string;
  worldSlug: string;
  title: string;
  concepts: string[];
}

export interface CurriculumRegistry {
  worlds: readonly WorldRow[];
  missions: readonly MissionRow[];
  lessons: readonly LessonRow[];
  concepts: readonly ConceptRow[];
  weeklyTemplates: readonly WeeklyTemplateRow[];
}

/** What lib/learning-engine says about the lesson the learner is on; gamification only decorates it. */
export interface CurrentLessonState {
  lessonSlug: string;
  progressPct: number; // lessonProgress(lessonState)
  nextStep: Segment;
  actions: FlexAction[];
}

/**
 * Every input the dashboard and progress view models need, loaded in one place (db/queries/dashboard.ts)
 * and handed to the pure engines. All dates are learner-local calendar dates unless named `*At` (ISO instants).
 */
export interface GamificationContext {
  userId: string;
  profile: { displayName: string; timeZone: string };
  todayLocal: string; // computed once from profiles.time_zone by the loader
  attempts: readonly AttemptRow[]; // ascending by createdAt
  xpTransactions: readonly XpTransactionRow[]; // ascending by createdAt
  qualifyingDays: readonly string[]; // v_qualifying_days.local_date for this user
  masteries: readonly MasteryRow[];
  reviewItems: readonly ReviewItemRow[];
  lessonProgress: readonly LessonProgressRow[];
  registry: CurriculumRegistry;
  currentLesson: CurrentLessonState | null; // null when every core lesson is done (or nothing is selectable)
  lastDashboardViewedAt: string | null; // ISO; unlock toasts are achievement rows after this instant
}

// Small typed accessors for the jsonb columns; every predicate below reads through these so an unexpected
// shape degrades to "no signal" instead of throwing inside a Server Action.
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function numberAt(value: unknown, key: string): number | null {
  const rec = asRecord(value);
  const v = rec?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function bossDefeated(attempt: Pick<AttemptRow, 'llmEvaluation'>): boolean {
  return asRecord(attempt.llmEvaluation)?.defeated === true;
}
