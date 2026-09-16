// Curriculum registry readers (slugs, ordering, release, content_hash). Lesson bodies live in data/ and are read
// through lib/curriculum loaders; these rows exist so learner FKs are readable and cron routes can join titles.
// Rows are never deleted: `retired_at` marks a slug that left data/ (scripts/sync-curriculum.ts), so readers
// exclude retired rows by default and learner history can still resolve them with `includeRetired`.
import 'server-only';
import type { Tables } from '@/types/database';
import { QueryError, type Db } from './client';

export type WorldRow = Tables<'worlds'>;
export type MissionRow = Tables<'missions'>;
export type LessonRow = Tables<'lessons'>;
export type ConceptRow = Tables<'concepts'>;
export type SkillRow = Tables<'skills'>;
export type LessonConceptRow = Tables<'lesson_concepts'>;
export type ConceptSkillRow = Tables<'concept_skills'>;

export interface RegistryOptions {
  includeRetired?: boolean;
}

export async function listSkills(db: Db): Promise<SkillRow[]> {
  const { data, error } = await db.from('skills').select('*').order('ordinal', { ascending: true });
  if (error) throw new QueryError('skills.list', error);
  return data;
}

export async function listWorlds(db: Db, options: RegistryOptions = {}): Promise<WorldRow[]> {
  let query = db.from('worlds').select('*').order('ordinal', { ascending: true });
  if (!options.includeRetired) query = query.is('retired_at', null);
  const { data, error } = await query;
  if (error) throw new QueryError('worlds.list', error);
  return data;
}

export async function getWorldRow(db: Db, slug: string): Promise<WorldRow | null> {
  const { data, error } = await db.from('worlds').select('*').eq('id', slug).maybeSingle();
  if (error) throw new QueryError('worlds.get', error);
  return data;
}

export async function listMissions(db: Db, worldId?: string, options: RegistryOptions = {}): Promise<MissionRow[]> {
  let query = db.from('missions').select('*').order('world_id', { ascending: true }).order('ordinal', { ascending: true });
  if (worldId !== undefined) query = query.eq('world_id', worldId);
  if (!options.includeRetired) query = query.is('retired_at', null);
  const { data, error } = await query;
  if (error) throw new QueryError('missions.list', error);
  return data;
}

export async function getLessonRow(db: Db, slug: string): Promise<LessonRow | null> {
  const { data, error } = await db.from('lessons').select('*').eq('id', slug).maybeSingle();
  if (error) throw new QueryError('lessons.get', error);
  return data;
}

export interface ListLessonsOptions extends RegistryOptions {
  missionId?: string;
  /** `lessons.kind` check set: lesson | lab | side_quest | boss | capstone. */
  kind?: string;
  /** `lessons.visibility` check set: core | side | hidden. */
  visibility?: string;
}

export async function listLessons(db: Db, options: ListLessonsOptions = {}): Promise<LessonRow[]> {
  let query = db.from('lessons').select('*').order('day', { ascending: true }).order('ordinal', { ascending: true });
  if (options.missionId !== undefined) query = query.eq('mission_id', options.missionId);
  if (options.kind !== undefined) query = query.eq('kind', options.kind);
  if (options.visibility !== undefined) query = query.eq('visibility', options.visibility);
  if (!options.includeRetired) query = query.is('retired_at', null);
  const { data, error } = await query;
  if (error) throw new QueryError('lessons.list', error);
  return data;
}

export async function listConcepts(db: Db, options: RegistryOptions & { worldId?: string } = {}): Promise<ConceptRow[]> {
  let query = db.from('concepts').select('*').order('id', { ascending: true });
  if (options.worldId !== undefined) query = query.eq('world_id', options.worldId);
  if (!options.includeRetired) query = query.is('retired_at', null);
  const { data, error } = await query;
  if (error) throw new QueryError('concepts.list', error);
  return data;
}

/** Primary concept first, then by concept id, so `LessonRow.concepts` (gamification context) keeps its contract. */
export async function listLessonConcepts(db: Db, lessonIds?: readonly string[]): Promise<LessonConceptRow[]> {
  let query = db
    .from('lesson_concepts')
    .select('*')
    .order('lesson_id', { ascending: true })
    .order('is_primary', { ascending: false })
    .order('concept_id', { ascending: true });
  if (lessonIds !== undefined) query = query.in('lesson_id', [...lessonIds]);
  const { data, error } = await query;
  if (error) throw new QueryError('lesson_concepts.list', error);
  return data;
}

export async function listConceptSkills(db: Db): Promise<ConceptSkillRow[]> {
  const { data, error } = await db.from('concept_skills').select('*').order('concept_id', { ascending: true });
  if (error) throw new QueryError('concept_skills.list', error);
  return data;
}

export interface RegistryRows {
  skills: SkillRow[];
  worlds: WorldRow[];
  missions: MissionRow[];
  lessons: LessonRow[];
  concepts: ConceptRow[];
  lessonConcepts: LessonConceptRow[];
  conceptSkills: ConceptSkillRow[];
}

/** The whole registry in one round of parallel selects (small tables: 6 worlds, ~180 lessons). */
export async function loadRegistryRows(db: Db, options: RegistryOptions = {}): Promise<RegistryRows> {
  const [skills, worlds, missions, lessons, concepts, lessonConcepts, conceptSkills] = await Promise.all([
    listSkills(db),
    listWorlds(db, options),
    listMissions(db, undefined, options),
    listLessons(db, options),
    listConcepts(db, options),
    listLessonConcepts(db),
    listConceptSkills(db),
  ]);
  return { skills, worlds, missions, lessons, concepts, lessonConcepts, conceptSkills };
}
