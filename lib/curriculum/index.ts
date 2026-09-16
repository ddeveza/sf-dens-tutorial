// lib/curriculum public surface: loaders over an injected registry (createCurriculum) plus a default instance over
// data/curriculum. Pages read content only through these loaders; `data/` is never imported by `app/`.
// The default instance is built lazily on first use (module bindings are read at call time, never at import time),
// so import order between data/curriculum and this module can never bite.
import { REGISTRY as DATA_REGISTRY } from '../../data/curriculum/index.ts';
import type { RuleSet, RuleSetId } from '../simulations/rule-set.ts';
import { SOURCES_CONFIG } from '../sources/config.ts';
import type { SourcesConfig } from '../sources/config.ts';
import { sourcesByTier } from '../sources/index.ts';
import type { Release, Source } from '../sources/types.ts';
import { lessonExercises } from './builders.ts';
import type { Registry } from './registry.ts';
import { isRuleSetId } from './schema.ts';
import type { AntiPattern, BestPractice, Concept, Exercise, Lesson, LessonKind, LessonVisibility, Mission, WeeklyBossTemplate, World } from './schema.ts';
import { lessonVerificationView } from './verification.ts';
import type { LessonVerificationView } from './verification.ts';

export * from './schema.ts';
export * from './config.ts';
export * from './builders.ts';
export * from './client-view.ts';
export * from './verification.ts';
export * from './lint.ts';
export type { Registry } from './registry.ts';
export { JARGON_TERMS, JARGON_TERM_STRINGS } from './jargon.ts';
export type { JargonTerm } from './jargon.ts';
export { toWeeklyTemplateRow, toWeeklyTemplateRows } from './weekly-rows.ts';

export interface MissionView {
  mission: Mission;
  world: World | null;
  lessons: Lesson[]; // every lesson of the mission by ordinal
  coreLessons: Lesson[]; // visibility 'core' by ordinal
  bossLesson: Lesson | null; // the mission's kind 'boss' lesson
}

export interface WorldView {
  world: World;
  missions: MissionView[]; // by ordinal
  lessons: Lesson[]; // by day, then ordinal
  concepts: Concept[]; // concepts whose world is this one
}

export interface GlossaryEntry {
  term: string;
  caveman: string;
  technical: string;
}

export interface LessonView {
  lesson: Lesson;
  world: World | null;
  mission: Mission | null;
  concepts: Concept[]; // lesson.concepts order; unresolved slugs skipped (curriculum.test.ts forbids them)
  sources: Source[]; // resolved, in SOURCES_CONFIG.tierOrder
  release: Release | null;
  ruleSet: RuleSet<unknown> | null;
  verification: LessonVerificationView; // authored block + effectiveStatus (§C propagation, stale derivation, changeNote.since rule)
  glossary: GlossaryEntry[]; // concept terms: caveman phrase -> technical term
  previous: Lesson | null; // previous core lesson of the mission
  next: Lesson | null; // next core lesson of the mission
}

export interface ConceptNode {
  concept: Concept;
  depth: number; // 0 for roots
  isLeaf: boolean;
  lessonSlugs: string[]; // lessons whose `concepts` include this slug
  children: ConceptNode[];
}

export interface ExerciseLookup {
  exercise: Exercise;
  lessonSlug: string | null;
  templateId: string | null;
}

export interface LessonFilter {
  world?: string;
  mission?: string;
  kind?: LessonKind;
  visibility?: LessonVisibility;
}

export interface Curriculum {
  readonly registry: Registry;
  getWorld(slug: string): WorldView | null;
  getMission(slug: string): MissionView | null;
  getLesson(slug: string, today: string): LessonView | null;
  getLessonByDay(day: number): Lesson | null;
  getConceptTree(world?: string): ConceptNode[];
  getConcept(slug: string): Concept | null;
  getExercise(id: string): ExerciseLookup | null;
  getWeeklyTemplates(world: string): WeeklyBossTemplate[];
  getSource(id: string): Source | null;
  getRelease(id: string): Release | null;
  getRuleSet(id: string): RuleSet<unknown> | null;
  getAntiPattern(id: string): AntiPattern | null;
  getBestPractice(id: string): BestPractice | null;
  listWorlds(): World[];
  listLessons(filter?: LessonFilter): Lesson[];
  lessonsForConcept(slug: string): Lesson[];
}

function byOrdinal(a: { ordinal: number }, b: { ordinal: number }): number {
  return a.ordinal - b.ordinal;
}

function byDayThenOrdinal(a: Lesson, b: Lesson): number {
  return a.day - b.day || a.ordinal - b.ordinal;
}

export function createCurriculum(registry: Registry, sourcesConfig: SourcesConfig = SOURCES_CONFIG): Curriculum {
  const worlds = new Map(registry.WORLDS.map((world) => [world.slug, world]));
  const missions = new Map(registry.MISSIONS.map((mission) => [mission.slug, mission]));
  const lessons = new Map(registry.LESSONS.map((lesson) => [lesson.slug, lesson]));
  const concepts = new Map(registry.CONCEPTS.map((concept) => [concept.slug, concept]));
  const sources = new Map(registry.SOURCES.map((source) => [source.id, source]));
  const releases = new Map(registry.RELEASES.map((release) => [release.id, release]));
  const ruleSets = new Map<RuleSetId, RuleSet<unknown>>(registry.RULE_SETS.map((ruleSet) => [ruleSet.id, ruleSet]));
  const antiPatterns = new Map(registry.LESSONS.flatMap((lesson) => lesson.antiPatterns.map((entry) => [entry.id, entry] as const)));
  const bestPractices = new Map(registry.LESSONS.flatMap((lesson) => lesson.bestPractices.map((entry) => [entry.id, entry] as const)));

  const exercises = new Map<string, ExerciseLookup>();
  for (const lesson of registry.LESSONS) {
    for (const exercise of lessonExercises(lesson)) exercises.set(exercise.id, { exercise, lessonSlug: lesson.slug, templateId: null });
  }
  for (const template of registry.WEEKLY_TEMPLATES) {
    exercises.set(template.exercise.id, { exercise: template.exercise, lessonSlug: null, templateId: template.id });
  }

  const lessonsByConcept = new Map<string, Lesson[]>();
  for (const lesson of [...registry.LESSONS].sort(byDayThenOrdinal)) {
    for (const slug of lesson.concepts) {
      const bucket = lessonsByConcept.get(slug) ?? [];
      bucket.push(lesson);
      lessonsByConcept.set(slug, bucket);
    }
  }

  const missionView = (mission: Mission): MissionView => {
    const all = registry.LESSONS.filter((lesson) => lesson.mission === mission.slug).sort(byOrdinal);
    const coreLessons = all.filter((lesson) => lesson.visibility === 'core');
    return {
      mission,
      world: worlds.get(mission.world) ?? null,
      lessons: all,
      coreLessons,
      bossLesson: coreLessons.find((lesson) => lesson.kind === 'boss') ?? null,
    };
  };

  const conceptTree = (world?: string): ConceptNode[] => {
    const pool = registry.CONCEPTS.filter((concept) => world === undefined || concept.world === world);
    const poolSlugs = new Set(pool.map((concept) => concept.slug));
    const childrenOf = new Map<string, Concept[]>();
    const roots: Concept[] = [];
    for (const concept of pool) {
      if (concept.parent !== undefined && poolSlugs.has(concept.parent)) {
        const bucket = childrenOf.get(concept.parent) ?? [];
        bucket.push(concept);
        childrenOf.set(concept.parent, bucket);
      } else {
        roots.push(concept);
      }
    }
    const bySlug = (a: Concept, b: Concept) => a.slug.localeCompare(b.slug);
    const build = (concept: Concept, depth: number): ConceptNode => {
      const children = (childrenOf.get(concept.slug) ?? []).sort(bySlug).map((child) => build(child, depth + 1));
      return {
        concept,
        depth,
        isLeaf: children.length === 0,
        lessonSlugs: (lessonsByConcept.get(concept.slug) ?? []).map((lesson) => lesson.slug),
        children,
      };
    };
    return roots.sort(bySlug).map((concept) => build(concept, 0));
  };

  const lessonView = (lesson: Lesson, today: string): LessonView => {
    const resolvedConcepts = lesson.concepts.map((slug) => concepts.get(slug)).filter((concept): concept is Concept => concept !== undefined);
    const cited = lesson.sources.map((id) => sources.get(id)).filter((source): source is Source => source !== undefined);
    const siblings = registry.LESSONS.filter((entry) => entry.mission === lesson.mission && entry.visibility === 'core').sort(byOrdinal);
    const position = siblings.findIndex((entry) => entry.slug === lesson.slug);
    return {
      lesson,
      world: worlds.get(lesson.world) ?? null,
      mission: missions.get(lesson.mission) ?? null,
      concepts: resolvedConcepts,
      sources: sourcesByTier(cited, sourcesConfig),
      release: releases.get(lesson.verification.release) ?? null,
      ruleSet: lesson.simulation ? (ruleSets.get(lesson.simulation.ruleSetId) ?? null) : null,
      verification: lessonVerificationView(lesson, sources, today, sourcesConfig),
      glossary: resolvedConcepts.flatMap((concept) => concept.terms.map((entry) => ({ term: entry.term, caveman: entry.caveman, technical: entry.term }))),
      previous: position > 0 ? siblings[position - 1] : null,
      next: position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : null,
    };
  };

  return {
    registry,
    getWorld(slug) {
      const world = worlds.get(slug);
      if (!world) return null;
      return {
        world,
        missions: registry.MISSIONS.filter((mission) => mission.world === slug).sort(byOrdinal).map(missionView),
        lessons: registry.LESSONS.filter((lesson) => lesson.world === slug).sort(byDayThenOrdinal),
        concepts: registry.CONCEPTS.filter((concept) => concept.world === slug),
      };
    },
    getMission(slug) {
      const mission = missions.get(slug);
      return mission ? missionView(mission) : null;
    },
    getLesson(slug, today) {
      const lesson = lessons.get(slug);
      return lesson ? lessonView(lesson, today) : null;
    },
    getLessonByDay(day) {
      return registry.LESSONS.find((lesson) => lesson.day === day && lesson.visibility === 'core') ?? null;
    },
    getConceptTree: conceptTree,
    getConcept: (slug) => concepts.get(slug) ?? null,
    getExercise: (id) => exercises.get(id) ?? null,
    getWeeklyTemplates: (world) => registry.WEEKLY_TEMPLATES.filter((template) => template.world === world),
    getSource: (id) => sources.get(id) ?? null,
    getRelease: (id) => releases.get(id) ?? null,
    getRuleSet: (id) => (isRuleSetId(id) ? (ruleSets.get(id) ?? null) : null),
    getAntiPattern: (id) => antiPatterns.get(id) ?? null,
    getBestPractice: (id) => bestPractices.get(id) ?? null,
    listWorlds: () => [...registry.WORLDS].sort(byOrdinal),
    listLessons(filter = {}) {
      return registry.LESSONS.filter(
        (lesson) =>
          (filter.world === undefined || lesson.world === filter.world) &&
          (filter.mission === undefined || lesson.mission === filter.mission) &&
          (filter.kind === undefined || lesson.kind === filter.kind) &&
          (filter.visibility === undefined || lesson.visibility === filter.visibility),
      ).sort(byDayThenOrdinal);
    },
    lessonsForConcept: (slug) => [...(lessonsByConcept.get(slug) ?? [])],
  };
}

let defaultInstance: Curriculum | null = null;

/** The curriculum over data/curriculum, built on first use. */
export function getCurriculum(): Curriculum {
  defaultInstance ??= createCurriculum(DATA_REGISTRY);
  return defaultInstance;
}

export const getWorld: Curriculum['getWorld'] = (slug) => getCurriculum().getWorld(slug);
export const getMission: Curriculum['getMission'] = (slug) => getCurriculum().getMission(slug);
export const getLesson: Curriculum['getLesson'] = (slug, today) => getCurriculum().getLesson(slug, today);
export const getLessonByDay: Curriculum['getLessonByDay'] = (day) => getCurriculum().getLessonByDay(day);
export const getConceptTree: Curriculum['getConceptTree'] = (world) => getCurriculum().getConceptTree(world);
export const getConcept: Curriculum['getConcept'] = (slug) => getCurriculum().getConcept(slug);
export const getExercise: Curriculum['getExercise'] = (id) => getCurriculum().getExercise(id);
export const getWeeklyTemplates: Curriculum['getWeeklyTemplates'] = (world) => getCurriculum().getWeeklyTemplates(world);
export const getRuleSet: Curriculum['getRuleSet'] = (id) => getCurriculum().getRuleSet(id);
export const getAntiPattern: Curriculum['getAntiPattern'] = (id) => getCurriculum().getAntiPattern(id);
export const listWorlds: Curriculum['listWorlds'] = () => getCurriculum().listWorlds();
export const listLessons: Curriculum['listLessons'] = (filter) => getCurriculum().listLessons(filter);
