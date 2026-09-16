// Loads every GamificationContext input (lib/gamification/context.ts) in one Promise.all and maps rows to the plain,
// serialisable shapes the pure engines read. Nothing here computes XP, level, streak or bands.
import 'server-only';
import type {
  AttemptRow as CtxAttemptRow,
  ConceptRow as CtxConceptRow,
  CurrentLessonState,
  CurriculumRegistry,
  GamificationContext,
  LessonKind,
  LessonProgressRow as CtxLessonProgressRow,
  LessonRow as CtxLessonRow,
  LessonVisibility,
  MasteryRow as CtxMasteryRow,
  MissionRow as CtxMissionRow,
  ReviewItemRow as CtxReviewItemRow,
  WeeklyTemplateRow,
  WorldRow as CtxWorldRow,
  XpTransactionRow,
} from '@/lib/gamification/context';
import { SKILL_IDS, type SkillId } from '@/lib/gamification/types';
import { toDepth } from '@/lib/learning-engine/util';
import { parseMasteryState } from '@/lib/mastery-engine/state';
import { DIMENSIONS, type Dimension } from '@/lib/mastery-engine/types';
import type { Database, Tables } from '@/types/database';
import { listAttemptsForUser, type AttemptRow } from './attempts';
import { QueryError, type Db } from './client';
import { loadRegistryRows, type RegistryRows } from './curriculum';
import { getMasteryForUser, type MasteryRow } from './mastery';
import { requireProfile, type ProfileRow } from './profiles';
import { listReviewItems, type ReviewItemRow } from './reviews';
import { listLessonProgress, type LessonProgressRow } from './steps';

export type QualifyingDayRow = Database['public']['Views']['v_qualifying_days']['Row'];
export type XpRow = Tables<'xp_transactions'>;

const LESSON_KINDS: readonly LessonKind[] = ['lesson', 'lab', 'side_quest', 'boss', 'capstone'];
const LESSON_VISIBILITIES: readonly LessonVisibility[] = ['core', 'side', 'hidden'];

// ---------------------------------------------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------------------------------------------

/** `v_qualifying_days` (security_invoker): the streak's only input. */
export async function listQualifyingDays(db: Db, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from('v_qualifying_days')
    .select('local_date')
    .eq('user_id', userId)
    .order('local_date', { ascending: true });
  if (error) throw new QueryError('v_qualifying_days.select', error);
  return data.flatMap((row) => (row.local_date === null ? [] : [row.local_date]));
}

export async function listXpTransactions(db: Db, userId: string): Promise<XpRow[]> {
  const { data, error } = await db
    .from('xp_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new QueryError('xp_transactions.list', error);
  return data;
}

// ---------------------------------------------------------------------------------------------------------------
// Row -> context mappers (exported so the cron routes can reuse them)
// ---------------------------------------------------------------------------------------------------------------

function checkMember<T extends string>(op: string, allowed: readonly T[], value: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new QueryError(op, { message: `unexpected value '${value}' (allowed: ${allowed.join(', ')})` });
}

export function toContextAttempt(row: AttemptRow): CtxAttemptRow {
  return {
    id: row.id,
    kind: row.kind,
    questionType: row.question_type,
    lessonSlug: row.lesson_id,
    conceptId: row.concept_id,
    conceptIds: row.concept_ids,
    exerciseId: row.exercise_id,
    formKey: row.form_key,
    dimension: row.dimension,
    depth: toDepth(row.depth),
    score: row.score,
    correct: row.correct,
    passed: row.passed,
    selfConfidence: row.self_confidence,
    probeAngle: row.probe_angle,
    reviewItemId: row.review_item_id,
    bossKind: row.boss_kind,
    bossRef: row.boss_ref,
    answer: row.answer,
    llmEvaluation: row.llm_evaluation,
    misconceptionIds: row.misconception_ids,
    status: row.status,
    durationMs: row.duration_ms,
    localDate: row.local_date,
    createdAt: row.created_at,
  };
}

export function toContextXp(row: XpRow): XpTransactionRow {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    reason: row.reason,
    ref: row.ref,
    base: row.base,
    multiplier: row.multiplier,
    amount: row.amount,
    localDate: row.local_date,
    createdAt: row.created_at,
  };
}

export function toContextMastery(row: MasteryRow): CtxMasteryRow {
  const state = parseMasteryState(row);
  const evidenceByDimension = {} as Record<Dimension, number>;
  for (const d of DIMENSIONS) evidenceByDimension[d] = state.dims[d].evidenceCount;
  return {
    conceptId: row.concept_id,
    scores: {
      recall: row.recall,
      understanding: row.understanding,
      application: row.application,
      debugging: row.debugging,
      architecture: row.architecture,
      teach_back: row.teach_back,
    },
    overall: row.overall,
    band: row.band,
    evidenceCount: row.evidence_count,
    evidenceByDimension,
    updatedAt: row.updated_at,
  };
}

export function toContextReviewItem(row: ReviewItemRow): CtxReviewItemRow {
  return { id: row.id, conceptId: row.concept_id, dueOn: row.due_on, lapses: row.lapses, reviewCount: row.review_count, reason: row.reason };
}

export function toContextLessonProgress(row: LessonProgressRow): CtxLessonProgressRow {
  return { lessonSlug: row.lesson_id, status: row.status, completedAt: row.completed_at, updatedAt: row.updated_at };
}

/**
 * Registry rows -> CurriculumRegistry. `LessonRow.concepts` keeps the primary concept first (listLessonConcepts
 * orders it so); a concept without concept_skills rows falls back to its own `skill` column at weight 1; the
 * registry carries no importance, so every concept weighs 1. Weekly templates live in data/, never in the DB.
 */
export function toCurriculumRegistry(rows: RegistryRows, weeklyTemplates: readonly WeeklyTemplateRow[] = []): CurriculumRegistry {
  const conceptsByLesson = new Map<string, string[]>();
  for (const lc of rows.lessonConcepts) {
    const list = conceptsByLesson.get(lc.lesson_id) ?? [];
    list.push(lc.concept_id);
    conceptsByLesson.set(lc.lesson_id, list);
  }
  const skillsByConcept = new Map<string, Partial<Record<SkillId, number>>>();
  for (const cs of rows.conceptSkills) {
    const skills = skillsByConcept.get(cs.concept_id) ?? {};
    skills[checkMember('concept_skills.skill_id', SKILL_IDS, cs.skill_id)] = cs.weight;
    skillsByConcept.set(cs.concept_id, skills);
  }

  const worlds: CtxWorldRow[] = rows.worlds.map((w) => ({
    slug: w.id,
    ordinal: w.ordinal,
    title: w.title,
    skill: checkMember('worlds.skill', SKILL_IDS, w.skill),
  }));
  const missions: CtxMissionRow[] = rows.missions.map((m) => ({
    slug: m.id,
    worldSlug: m.world_id,
    ordinal: m.ordinal,
    title: m.title,
    bossLessonSlug: m.boss_lesson_id,
  }));
  const lessons: CtxLessonRow[] = rows.lessons.map((l) => ({
    slug: l.id,
    day: l.day,
    kind: checkMember('lessons.kind', LESSON_KINDS, l.kind),
    visibility: checkMember('lessons.visibility', LESSON_VISIBILITIES, l.visibility),
    missionSlug: l.mission_id,
    ordinal: l.ordinal,
    title: l.title,
    concepts: conceptsByLesson.get(l.id) ?? [],
  }));
  const concepts: CtxConceptRow[] = rows.concepts.map((c) => ({
    slug: c.id,
    parentSlug: c.parent_id,
    worldSlug: c.world_id,
    title: c.title,
    skills: skillsByConcept.get(c.id) ?? { [checkMember('concepts.skill', SKILL_IDS, c.skill)]: 1 },
    importance: 1,
  }));
  return { worlds, missions, lessons, concepts, weeklyTemplates: [...weeklyTemplates] };
}

// ---------------------------------------------------------------------------------------------------------------
// Composite loader
// ---------------------------------------------------------------------------------------------------------------

/** Inputs the DB does not hold: the page derives `currentLesson` with lib/learning-engine, data/ owns weekly templates. */
export interface GamificationExtras {
  weeklyTemplates?: readonly WeeklyTemplateRow[];
  currentLesson?: CurrentLessonState | null;
  lastDashboardViewedAt?: string | null;
  /** Already-loaded profile (dashboard.ts computes todayLocal from it first); saves one round trip. */
  profile?: ProfileRow;
}

/**
 * Every learner ledger plus the (non-retired) registry in one Promise.all. Retired registry rows are excluded:
 * they no longer belong to the path, and a ledger row pointing at one resolves to `undefined` in the engines'
 * lookups, which they tolerate. `todayLocal` is computed once by the caller from profiles.time_zone.
 */
export async function loadGamificationContext(
  db: Db,
  userId: string,
  todayLocal: string,
  extras: GamificationExtras = {},
): Promise<GamificationContext> {
  const [profile, attempts, xp, qualifyingDays, masteries, reviewItems, lessonProgress, registryRows] = await Promise.all([
    extras.profile ? Promise.resolve(extras.profile) : requireProfile(db, userId),
    listAttemptsForUser(db, userId),
    listXpTransactions(db, userId),
    listQualifyingDays(db, userId),
    getMasteryForUser(db, userId),
    listReviewItems(db, userId),
    listLessonProgress(db, userId),
    loadRegistryRows(db),
  ]);
  return {
    userId,
    profile: { displayName: profile.display_name, timeZone: profile.time_zone },
    todayLocal,
    attempts: attempts.map(toContextAttempt),
    xpTransactions: xp.map(toContextXp),
    qualifyingDays,
    masteries: [...masteries.values()].map(toContextMastery),
    reviewItems: reviewItems.map(toContextReviewItem),
    lessonProgress: lessonProgress.map(toContextLessonProgress),
    registry: toCurriculumRegistry(registryRows, extras.weeklyTemplates),
    currentLesson: extras.currentLesson ?? null,
    lastDashboardViewedAt: extras.lastDashboardViewedAt ?? null,
  };
}
