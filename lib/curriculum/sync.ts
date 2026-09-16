// Pure half of scripts/sync-curriculum.ts: registry -> rows for the curriculum registry tables (Data Model §3 DDL),
// content hashes, release validation and retirement diffs. The script only does IO. Relative `.ts` specifiers and
// no enum syntax: this runs under plain node type stripping.
import { createHash } from 'node:crypto';
import { SKILL_IDS, SKILL_LABELS } from '../gamification/types.ts';
import type { SkillId } from '../gamification/types.ts';
import type { Registry } from './registry.ts';
import type { Concept, Lesson } from './schema.ts';

export interface WorldRow {
  id: string;
  ordinal: number;
  title: string;
  skill: SkillId;
  retired_at: null;
}
export interface MissionRow {
  id: string;
  world_id: string;
  ordinal: number;
  title: string;
  boss_lesson_id: string | null;
  retired_at: null;
}
export interface SkillRow {
  id: SkillId;
  ordinal: number;
  label: string;
}
export interface ConceptRow {
  id: string;
  parent_id: string | null;
  world_id: string;
  title: string;
  skill: SkillId;
  retired_at: null;
}
export interface LessonRow {
  id: string;
  mission_id: string;
  day: number;
  kind: Lesson['kind'];
  visibility: Lesson['visibility'];
  ordinal: number;
  title: string;
  release: string;
  api_version: string;
  content_hash: string;
  retired_at: null;
}
export interface LessonConceptRow {
  lesson_id: string;
  concept_id: string;
  is_primary: boolean;
}
export interface ConceptSkillRow {
  concept_id: string;
  skill_id: SkillId;
  weight: number; // numeric(3,2): rounded to 2 decimals, > 0 and <= 1
}

/** Upsert order is the property order here: worlds -> missions -> skills -> concepts -> lessons -> lesson_concepts -> concept_skills. */
export interface SyncPlan {
  worlds: WorldRow[];
  missions: MissionRow[];
  skills: SkillRow[];
  concepts: ConceptRow[];
  lessons: LessonRow[];
  lessonConcepts: LessonConceptRow[];
  conceptSkills: ConceptSkillRow[];
}

export const SYNC_TABLE_ORDER = ['worlds', 'missions', 'skills', 'concepts', 'lessons', 'lesson_concepts', 'concept_skills'] as const;

export class SyncValidationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`curriculum sync refused:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'SyncValidationError';
    this.problems = problems;
  }
}

/** sha256 of JSON.stringify(lesson): stable for an unchanged lesson object, different for any content change. */
export function contentHash(lesson: Lesson): string {
  return createHash('sha256').update(JSON.stringify(lesson)).digest('hex');
}

/** The heaviest skill; ties resolve in SKILL_IDS order. */
export function primarySkill(skills: Partial<Record<SkillId, number>> | undefined, fallback: SkillId): SkillId {
  let best: SkillId | null = null;
  let bestWeight = -Infinity;
  for (const skill of SKILL_IDS) {
    const weight = skills?.[skill];
    if (weight !== undefined && weight > bestWeight) {
      best = skill;
      bestWeight = weight;
    }
  }
  return best ?? fallback;
}

export const SKILL_ROWS: SkillRow[] = SKILL_IDS.map((id, index) => ({ id, ordinal: index + 1, label: SKILL_LABELS[id] }));

/** Every lesson's (verification.release, verification.apiVersion) must name a release in RELEASES with that apiVersion. */
export function releaseMismatches(registry: Pick<Registry, 'LESSONS' | 'RELEASES'>): string[] {
  const releases = new Map(registry.RELEASES.map((release) => [release.id, release]));
  const problems: string[] = [];
  for (const lesson of registry.LESSONS) {
    const release = releases.get(lesson.verification.release);
    if (!release) problems.push(`lesson ${lesson.slug}: verification.release '${lesson.verification.release}' is not in RELEASES`);
    else if (release.apiVersion !== lesson.verification.apiVersion) {
      problems.push(`lesson ${lesson.slug}: verification.apiVersion '${lesson.verification.apiVersion}' differs from release ${release.id} (${release.apiVersion})`);
    }
  }
  return problems;
}

function conceptDepth(concept: Concept, bySlug: Map<string, Concept>): number {
  let depth = 0;
  const seen = new Set<string>([concept.slug]);
  let current = concept;
  while (current.parent !== undefined) {
    const parent = bySlug.get(current.parent);
    if (!parent || seen.has(parent.slug)) break;
    seen.add(parent.slug);
    depth += 1;
    current = parent;
  }
  return depth;
}

/** Rows for every registry table; throws SyncValidationError on release mismatches or unresolvable parents/worlds. */
export function buildSyncPlan(registry: Registry): SyncPlan {
  const problems = releaseMismatches(registry);
  const worlds = new Map(registry.WORLDS.map((world) => [world.slug, world]));
  const conceptsBySlug = new Map(registry.CONCEPTS.map((concept) => [concept.slug, concept]));
  for (const concept of registry.CONCEPTS) {
    if (!worlds.has(concept.world)) problems.push(`concept ${concept.slug}: world '${concept.world}' is not in WORLDS`);
    if (concept.parent !== undefined && !conceptsBySlug.has(concept.parent)) problems.push(`concept ${concept.slug}: parent '${concept.parent}' is not in CONCEPTS`);
  }
  const missionSlugs = new Set(registry.MISSIONS.map((mission) => mission.slug));
  for (const lesson of registry.LESSONS) {
    if (!missionSlugs.has(lesson.mission)) problems.push(`lesson ${lesson.slug}: mission '${lesson.mission}' is not in MISSIONS`);
    lesson.concepts.forEach((slug) => !conceptsBySlug.has(slug) && problems.push(`lesson ${lesson.slug}: concept '${slug}' is not in CONCEPTS`));
  }
  if (problems.length > 0) throw new SyncValidationError(problems);

  const worldRows: WorldRow[] = [...registry.WORLDS]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((world) => ({ id: world.slug, ordinal: world.ordinal, title: world.title, skill: world.skill, retired_at: null }));

  const missionRows: MissionRow[] = [...registry.MISSIONS]
    .sort((a, b) => a.world.localeCompare(b.world) || a.ordinal - b.ordinal)
    .map((mission) => {
      const core = registry.LESSONS.filter((lesson) => lesson.mission === mission.slug && lesson.visibility === 'core' && lesson.kind !== 'capstone');
      const last = core.sort((a, b) => a.ordinal - b.ordinal).at(-1);
      return {
        id: mission.slug,
        world_id: mission.world,
        ordinal: mission.ordinal,
        title: mission.title,
        boss_lesson_id: last && last.kind === 'boss' ? last.slug : null,
        retired_at: null,
      };
    });

  const conceptRows: ConceptRow[] = [...registry.CONCEPTS]
    .map((concept) => ({ concept, depth: conceptDepth(concept, conceptsBySlug) }))
    .sort((a, b) => a.depth - b.depth || a.concept.slug.localeCompare(b.concept.slug)) // parents before children (FK)
    .map(({ concept }) => ({
      id: concept.slug,
      parent_id: concept.parent ?? null,
      world_id: concept.world,
      title: concept.title,
      skill: primarySkill(concept.skills, worlds.get(concept.world)?.skill ?? 'platform'),
      retired_at: null,
    }));

  const lessonRows: LessonRow[] = [...registry.LESSONS]
    .sort((a, b) => a.day - b.day || a.ordinal - b.ordinal)
    .map((lesson) => ({
      id: lesson.slug,
      mission_id: lesson.mission,
      day: lesson.day,
      kind: lesson.kind,
      visibility: lesson.visibility,
      ordinal: lesson.ordinal,
      title: lesson.title,
      release: lesson.verification.release,
      api_version: lesson.verification.apiVersion,
      content_hash: contentHash(lesson),
      retired_at: null,
    }));

  const lessonConceptRows: LessonConceptRow[] = registry.LESSONS.flatMap((lesson) =>
    [...new Set(lesson.concepts)].map((slug, index) => ({ lesson_id: lesson.slug, concept_id: slug, is_primary: index === 0 })),
  );

  const conceptSkillRows: ConceptSkillRow[] = registry.CONCEPTS.flatMap((concept) => {
    const skills = concept.skills ?? { [worlds.get(concept.world)?.skill ?? 'platform']: 1 };
    return SKILL_IDS.flatMap((skill) => {
      const weight = skills[skill];
      if (weight === undefined || weight <= 0) return [];
      return [{ concept_id: concept.slug, skill_id: skill, weight: Math.min(1, Math.round(weight * 100) / 100) }];
    }).filter((row) => row.weight > 0);
  });

  return { worlds: worldRows, missions: missionRows, skills: SKILL_ROWS, concepts: conceptRows, lessons: lessonRows, lessonConcepts: lessonConceptRows, conceptSkills: conceptSkillRows };
}

/** Rows present in the DB but absent from data/ get retired (never deleted); rows back in data/ get revived. */
export function retirementIds(existing: readonly { id: string; retired_at: string | null }[], presentIds: readonly string[]): { retire: string[]; revive: string[] } {
  const present = new Set(presentIds);
  return {
    retire: existing.filter((row) => !present.has(row.id) && row.retired_at === null).map((row) => row.id),
    revive: existing.filter((row) => present.has(row.id) && row.retired_at !== null).map((row) => row.id),
  };
}

export function planCounts(plan: SyncPlan): Record<(typeof SYNC_TABLE_ORDER)[number], number> {
  return {
    worlds: plan.worlds.length,
    missions: plan.missions.length,
    skills: plan.skills.length,
    concepts: plan.concepts.length,
    lessons: plan.lessons.length,
    lesson_concepts: plan.lessonConcepts.length,
    concept_skills: plan.conceptSkills.length,
  };
}
