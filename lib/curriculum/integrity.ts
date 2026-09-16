// The seven curriculum integrity checks (ARCHITECTURE.md §B "curriculum.test.ts integrity checks") as pure
// functions over a Registry, so curriculum.test.ts runs them over data/curriculum and integrity.test.ts proves each
// one catches its violation on a fixture registry. Findings, never throws. `today` is injected.
import { z } from 'zod';
import { tierPriority } from '../sources/types.ts';
import type { Source } from '../sources/types.ts';
import { ReleaseSchema, SourceSchema } from '../sources/schema.ts';
import type { SourcesConfig } from '../sources/config.ts';
import { isSimId } from '../simulations/rule-set.ts';
import { ruleSetSchema } from '../simulations/rule-set-schema.ts';
import { CURRICULUM_CONFIG } from './config.ts';
import type { CurriculumConfig } from './config.ts';
import { lessonExercises } from './builders.ts';
import type { Registry } from './registry.ts';
import { lintLesson } from './lint.ts';
import {
  CONCEPT_SLUG_RE,
  ConceptSchema,
  MissionSchema,
  SLUG_RE,
  WEEKLY_TEMPLATE_ID_RE,
  WeeklyBossTemplateSchema,
  WorldSchema,
  createLessonSchema,
  isValidIsoDate,
} from './schema.ts';
import type { Concept, Exercise, Lesson } from './schema.ts';
import { daysBetween } from './verification.ts';

export type CheckNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Finding {
  check: CheckNumber;
  where: string; // 'lesson d001-x', 'concept soql.selectivity', ...
  message: string;
}

export interface IntegrityOptions {
  today: string; // YYYY-MM-DD, injected by the caller
  config?: CurriculumConfig;
  sourcesConfig?: SourcesConfig;
}

export interface IntegrityReport {
  failures: Finding[];
  warnings: Finding[];
}

function finding(check: CheckNumber, where: string, message: string): Finding {
  return { check, where, message };
}

function parseFinding<S extends z.ZodType>(check: CheckNumber, schema: S, value: unknown, where: string): Finding | null {
  const result = schema.safeParse(value);
  return result.success ? null : finding(check, where, z.prettifyError(result.error));
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

function conceptExercises(registry: Registry): Array<{ where: string; exercise: Exercise }> {
  return [
    ...registry.LESSONS.flatMap((lesson) => lessonExercises(lesson).map((exercise) => ({ where: `lesson ${lesson.slug}`, exercise }))),
    ...registry.WEEKLY_TEMPLATES.map((template) => ({ where: `weekly template ${template.id}`, exercise: template.exercise })),
  ];
}

function isCoreNonCapstone(lesson: Lesson): boolean {
  return lesson.visibility === 'core' && lesson.kind !== 'capstone';
}

// 1. Every record parses with its Zod schema (builders already did; hand-edited objects are caught here).
export function checkSchemas(registry: Registry, options: IntegrityOptions): Finding[] {
  const findings: Finding[] = [];
  const lessonSchema = createLessonSchema({ today: options.today });
  const push = (entry: Finding | null) => entry && findings.push(entry);
  registry.WORLDS.forEach((world) => push(parseFinding(1, WorldSchema, world, `world ${world.slug}`)));
  registry.MISSIONS.forEach((mission) => push(parseFinding(1, MissionSchema, mission, `mission ${mission.slug}`)));
  registry.LESSONS.forEach((lesson) => push(parseFinding(1, lessonSchema, lesson, `lesson ${lesson.slug}`)));
  registry.WEEKLY_TEMPLATES.forEach((template) => push(parseFinding(1, WeeklyBossTemplateSchema, template, `weekly template ${template.id}`)));
  registry.CONCEPTS.forEach((concept) => push(parseFinding(1, ConceptSchema, concept, `concept ${concept.slug}`)));
  registry.SOURCES.forEach((source) => push(parseFinding(1, SourceSchema, source, `source ${source.id}`)));
  registry.RELEASES.forEach((release) => push(parseFinding(1, ReleaseSchema, release, `release ${release.id}`)));
  registry.RULE_SETS.forEach((ruleSet) => {
    if (!isSimId(ruleSet.simulation)) findings.push(finding(1, `rule set ${ruleSet.id}`, `unknown simulation '${String(ruleSet.simulation)}'`));
    else push(parseFinding(1, ruleSetSchema(ruleSet.simulation, z.unknown()), ruleSet, `rule set ${ruleSet.id}`));
  });
  return findings;
}

// 2. Slug regexes and uniqueness; day unique among core lessons; days 1-180 contiguous once complete.
export function checkIdentity(registry: Registry, options: IntegrityOptions): Finding[] {
  const config = options.config ?? CURRICULUM_CONFIG;
  const findings: Finding[] = [];
  const dupe = (label: string, values: string[]) => duplicates(values).forEach((value) => findings.push(finding(2, label, `duplicate '${value}'`)));

  registry.LESSONS.forEach((lesson) => !SLUG_RE.test(lesson.slug) && findings.push(finding(2, `lesson ${lesson.slug}`, 'slug fails the slug regex')));
  registry.CONCEPTS.forEach((concept) => !CONCEPT_SLUG_RE.test(concept.slug) && findings.push(finding(2, `concept ${concept.slug}`, 'slug fails the concept slug regex')));
  registry.WEEKLY_TEMPLATES.forEach((template) => !WEEKLY_TEMPLATE_ID_RE.test(template.id) && findings.push(finding(2, `weekly template ${template.id}`, 'id fails the template id regex')));
  registry.SOURCES.forEach((source) => {
    const prefixed = SourceSchema.shape.id.safeParse(source.id).success && source.id.startsWith(`${tierPrefixOf(source)}-`);
    if (!prefixed) findings.push(finding(2, `source ${source.id}`, `id prefix must match tier '${source.tier}'`));
  });

  dupe('worlds', registry.WORLDS.map((world) => world.slug));
  dupe('missions', registry.MISSIONS.map((mission) => mission.slug));
  dupe('lessons', registry.LESSONS.map((lesson) => lesson.slug));
  dupe('weekly templates', registry.WEEKLY_TEMPLATES.map((template) => template.id));
  dupe('exercises', conceptExercises(registry).map((entry) => entry.exercise.id));
  dupe('concepts', registry.CONCEPTS.map((concept) => concept.slug));
  dupe('sources', registry.SOURCES.map((source) => source.id));
  dupe('releases', registry.RELEASES.map((release) => release.id));
  dupe('rule sets', registry.RULE_SETS.map((ruleSet) => ruleSet.id));
  dupe('anti-patterns', registry.LESSONS.flatMap((lesson) => lesson.antiPatterns.map((entry) => entry.id)));
  dupe('best practices', registry.LESSONS.flatMap((lesson) => lesson.bestPractices.map((entry) => entry.id)));
  dupe('concept misconceptions', registry.CONCEPTS.flatMap((concept) => concept.misconceptions.map((entry) => `${concept.slug}#${entry.id}`)));

  const coreLessons = registry.LESSONS.filter((lesson) => lesson.visibility === 'core');
  dupe('core lesson days', coreLessons.map((lesson) => String(lesson.day)));
  dupe('lesson (mission, ordinal)', registry.LESSONS.map((lesson) => `${lesson.mission}#${lesson.ordinal}`));
  dupe('mission (world, ordinal)', registry.MISSIONS.map((mission) => `${mission.world}#${mission.ordinal}`));
  dupe('world ordinals', registry.WORLDS.map((world) => String(world.ordinal)));

  if (registry.LESSONS.length >= config.totalDays) {
    const days = new Set(coreLessons.map((lesson) => lesson.day));
    for (let day = config.dayRange.min; day <= config.dayRange.max; day += 1) {
      if (!days.has(day)) findings.push(finding(2, 'core lesson days', `day ${day} has no core lesson (days must be contiguous ${config.dayRange.min}-${config.dayRange.max})`));
    }
  }
  return findings;
}

function tierPrefixOf(source: Source): string {
  return { help: 'help', developer: 'dev', architect: 'arch', trust_release: 'rn', other: 'other' }[source.tier] ?? '';
}

// 3. Every reference resolves.
export function checkReferences(registry: Registry): Finding[] {
  const findings: Finding[] = [];
  const worlds = new Set(registry.WORLDS.map((world) => world.slug));
  const missions = new Map(registry.MISSIONS.map((mission) => [mission.slug, mission]));
  const lessons = new Map(registry.LESSONS.map((lesson) => [lesson.slug, lesson]));
  const concepts = new Set(registry.CONCEPTS.map((concept) => concept.slug));
  const sources = new Set(registry.SOURCES.map((source) => source.id));
  const releases = new Set(registry.RELEASES.map((release) => release.id));
  const ruleSets = new Map(registry.RULE_SETS.map((ruleSet) => [ruleSet.id, ruleSet]));
  const antiPatterns = new Set(registry.LESSONS.flatMap((lesson) => lesson.antiPatterns.map((entry) => entry.id)));
  const missing = (where: string, what: string, id: string) => findings.push(finding(3, where, `${what} '${id}' does not resolve`));

  for (const lesson of registry.LESSONS) {
    const where = `lesson ${lesson.slug}`;
    if (!worlds.has(lesson.world)) missing(where, 'world', lesson.world);
    const mission = missions.get(lesson.mission);
    if (!mission) missing(where, 'mission', lesson.mission);
    else if (mission.world !== lesson.world) findings.push(finding(3, where, `mission '${lesson.mission}' belongs to world '${mission.world}', not '${lesson.world}'`));
    lesson.concepts.forEach((slug) => !concepts.has(slug) && missing(where, 'concept', slug));
    lesson.sources.forEach((id) => !sources.has(id) && missing(where, 'source', id));
    lesson.releaseNotes.forEach((note) => !releases.has(note.release) && missing(where, 'release note release', note.release));
    if (!releases.has(lesson.verification.release)) missing(where, 'verification release', lesson.verification.release);
    if (lesson.simulation) {
      const ruleSet = ruleSets.get(lesson.simulation.ruleSetId);
      if (!ruleSet) missing(where, 'rule set', lesson.simulation.ruleSetId);
      else if (ruleSet.simulation !== lesson.simulation.id) {
        findings.push(finding(3, where, `rule set '${ruleSet.id}' is for '${ruleSet.simulation}', not '${lesson.simulation.id}'`));
      }
    }
    if (lesson.unlock.type === 'band' || lesson.unlock.type === 'hidden') {
      if (!concepts.has(lesson.unlock.concept)) missing(where, 'unlock concept', lesson.unlock.concept);
    }
    if (lesson.unlock.type === 'boss_defeated') {
      const target = lessons.get(lesson.unlock.lesson);
      if (!target) missing(where, 'unlock boss lesson', lesson.unlock.lesson);
      else if (target.kind !== 'boss') findings.push(finding(3, where, `unlock lesson '${target.slug}' is not a boss`));
    }
    lesson.deepDive?.limits.forEach((limit) => !sources.has(limit.sourceId) && missing(where, 'limit source', limit.sourceId));
    lesson.bestPractices.forEach((entry) => !concepts.has(entry.concept) && missing(`${where} best practice ${entry.id}`, 'concept', entry.concept));
    lesson.antiPatterns.forEach((entry) => !concepts.has(entry.concept) && missing(`${where} anti-pattern ${entry.id}`, 'concept', entry.concept));
  }

  for (const { where, exercise } of conceptExercises(registry)) {
    const label = `${where} exercise ${exercise.id}`;
    if (!concepts.has(exercise.concept)) missing(label, 'concept', exercise.concept);
    exercise.sourceIds?.forEach((id) => !sources.has(id) && missing(label, 'source', id));
    if (exercise.type === 'find_anti_pattern' && !antiPatterns.has(exercise.antiPatternId)) missing(label, 'anti-pattern', exercise.antiPatternId);
    if (exercise.type === 'debug_code' && exercise.fix >= exercise.fixOptions.length) {
      findings.push(finding(3, label, `fix ${exercise.fix} must be < fixOptions.length ${exercise.fixOptions.length}`));
    }
  }

  for (const concept of registry.CONCEPTS) {
    const where = `concept ${concept.slug}`;
    if (concept.parent !== undefined && !concepts.has(concept.parent)) missing(where, 'parent', concept.parent);
    if (!worlds.has(concept.world)) missing(where, 'world', concept.world);
  }
  for (const mission of registry.MISSIONS) {
    if (!worlds.has(mission.world)) missing(`mission ${mission.slug}`, 'world', mission.world);
  }
  for (const template of registry.WEEKLY_TEMPLATES) {
    const where = `weekly template ${template.id}`;
    if (!worlds.has(template.world)) missing(where, 'world', template.world);
    template.concepts.forEach((slug) => !concepts.has(slug) && missing(where, 'concept', slug));
    template.sources.forEach((id) => !sources.has(id) && missing(where, 'source', id));
    if (!releases.has(template.verification.release)) missing(where, 'verification release', template.verification.release);
  }
  for (const release of registry.RELEASES) {
    if (!sources.has(release.sourceId)) missing(`release ${release.id}`, 'source', release.sourceId);
  }
  for (const ruleSet of registry.RULE_SETS) {
    const where = `rule set ${ruleSet.id}`;
    if (!releases.has(ruleSet.release)) missing(where, 'release', ruleSet.release);
    ruleSet.sourceIds.forEach((id) => !sources.has(id) && missing(where, 'source', id));
  }
  return findings;
}

// 4. Missions end in a boss; worlds have enough weekly templates covering every core concept; one capstone at day 180.
export function checkStructure(registry: Registry, options: IntegrityOptions): Finding[] {
  const config = options.config ?? CURRICULUM_CONFIG;
  const findings: Finding[] = [];
  const conceptWorld = new Map(registry.CONCEPTS.map((concept) => [concept.slug, concept.world]));

  for (const mission of registry.MISSIONS) {
    const core = registry.LESSONS.filter((lesson) => lesson.mission === mission.slug && isCoreNonCapstone(lesson)).sort((a, b) => a.ordinal - b.ordinal);
    if (core.length === 0) continue;
    const last = core[core.length - 1];
    if (last.kind !== 'boss') findings.push(finding(4, `mission ${mission.slug}`, `last core lesson '${last.slug}' must be kind 'boss' (got '${last.kind}')`));
    const bosses = core.filter((lesson) => lesson.kind === 'boss');
    if (bosses.length > 1) findings.push(finding(4, `mission ${mission.slug}`, `has ${bosses.length} boss lessons; one closes a mission`));
  }

  for (const world of registry.WORLDS) {
    // The template minimum applies as soon as a world has concepts (authoring starts there); concept coverage needs lessons.
    const hasConcepts = registry.CONCEPTS.some((concept) => concept.world === world.slug);
    const coreLessons = registry.LESSONS.filter((lesson) => lesson.world === world.slug && isCoreNonCapstone(lesson));
    if (!hasConcepts && coreLessons.length === 0) continue;
    const templates = registry.WEEKLY_TEMPLATES.filter((template) => template.world === world.slug);
    if (templates.length < config.minWeeklyTemplatesPerWorld) {
      findings.push(finding(4, `world ${world.slug}`, `needs >= ${config.minWeeklyTemplatesPerWorld} weekly boss templates (got ${templates.length})`));
    }
    const covered = new Set(templates.flatMap((template) => template.concepts));
    const coreConcepts = new Set(coreLessons.flatMap((lesson) => lesson.concepts));
    for (const slug of coreConcepts) {
      if (!covered.has(slug)) findings.push(finding(4, `world ${world.slug}`, `core concept '${slug}' is covered by no weekly boss template`));
    }
  }

  for (const template of registry.WEEKLY_TEMPLATES) {
    template.concepts.forEach((slug) => {
      const world = conceptWorld.get(slug);
      if (world !== undefined && world !== template.world) {
        findings.push(finding(4, `weekly template ${template.id}`, `concept '${slug}' belongs to world '${world}', not '${template.world}'`));
      }
    });
  }

  const capstones = registry.LESSONS.filter((lesson) => lesson.kind === 'capstone');
  if (capstones.length > 1) findings.push(finding(4, 'capstone', `exactly one capstone lesson (got ${capstones.length})`));
  capstones.forEach((lesson) => lesson.day !== config.capstoneDay && findings.push(finding(4, `lesson ${lesson.slug}`, `capstone must be day ${config.capstoneDay}`)));
  if (registry.LESSONS.length >= config.totalDays && capstones.length === 0) findings.push(finding(4, 'capstone', `no capstone lesson at day ${config.capstoneDay}`));
  return findings;
}

// 5. Every concept a lesson references has best practice, anti-pattern, misconceptions and probe angles; parents are never exercise concepts.
export function checkConceptCoverage(registry: Registry, options: IntegrityOptions): Finding[] {
  const config = options.config ?? CURRICULUM_CONFIG;
  const findings: Finding[] = [];
  const concepts = new Map(registry.CONCEPTS.map((concept) => [concept.slug, concept]));
  const parents = new Set(registry.CONCEPTS.flatMap((concept) => (concept.parent !== undefined ? [concept.parent] : [])));
  const bestPracticeConcepts = new Set(registry.LESSONS.flatMap((lesson) => lesson.bestPractices.map((entry) => entry.concept)));
  const antiPatternConcepts = new Set(registry.LESSONS.flatMap((lesson) => lesson.antiPatterns.map((entry) => entry.concept)));
  const referenced = new Set(registry.LESSONS.flatMap((lesson) => lesson.concepts));

  for (const slug of referenced) {
    const concept: Concept | undefined = concepts.get(slug);
    if (!concept) continue; // check 3 reports it
    const where = `concept ${slug}`;
    if (!bestPracticeConcepts.has(slug)) findings.push(finding(5, where, 'no best practice anywhere in the registry'));
    if (!antiPatternConcepts.has(slug)) findings.push(finding(5, where, 'no anti-pattern anywhere in the registry'));
    if (concept.misconceptions.length < config.minMisconceptionsPerConcept) {
      findings.push(finding(5, where, `needs >= ${config.minMisconceptionsPerConcept} misconceptions (got ${concept.misconceptions.length})`));
    }
    const angles = Object.values(concept.probes).filter((templates) => templates !== undefined && templates.length > 0).length;
    if (angles < config.minProbeAnglesPerConcept) findings.push(finding(5, where, `needs >= ${config.minProbeAnglesPerConcept} probe angles with a template (got ${angles})`));
  }

  registry.LESSONS.forEach((lesson) => {
    lesson.concepts.forEach((slug) => parents.has(slug) && findings.push(finding(5, `lesson ${lesson.slug}`, `concept '${slug}' has children; lessons list leaves only`)));
  });
  for (const { where, exercise } of conceptExercises(registry)) {
    if (parents.has(exercise.concept)) findings.push(finding(5, `${where} exercise ${exercise.id}`, `concept '${exercise.concept}' has children; parents aggregate from descendants`));
  }
  return findings;
}

// 6. Jargon lint, limit-grade sources, dates, source-status rules (§C); the still-older verified lesson is a warning.
export function checkContentRules(registry: Registry, options: IntegrityOptions): IntegrityReport {
  const config = options.config ?? CURRICULUM_CONFIG;
  const failures: Finding[] = [];
  const warnings: Finding[] = [];
  const concepts = new Map(registry.CONCEPTS.map((concept) => [concept.slug, concept]));
  const sources = new Map(registry.SOURCES.map((source) => [source.id, source]));

  const checkDate = (where: string, lastVerified: string) => {
    if (!isValidIsoDate(lastVerified)) return failures.push(finding(6, where, `lastVerified '${lastVerified}' is not a calendar date`));
    if (lastVerified > options.today) return failures.push(finding(6, where, `lastVerified ${lastVerified} is after today ${options.today}`));
    const age = daysBetween(lastVerified, options.today);
    if (age > config.maxSourceAgeDays) failures.push(finding(6, where, `lastVerified is ${age} days old (max ${config.maxSourceAgeDays})`));
    else if (age > config.warnSourceAgeDays) warnings.push(finding(6, where, `lastVerified is ${age} days old (warn after ${config.warnSourceAgeDays})`));
  };

  for (const source of registry.SOURCES) {
    if (source.status === 'documentation_changed' && !source.changeNote) failures.push(finding(6, `source ${source.id}`, 'documentation_changed requires a changeNote'));
  }

  for (const lesson of registry.LESSONS) {
    const where = `lesson ${lesson.slug}`;
    const lessonConcepts = lesson.concepts.map((slug) => concepts.get(slug)).filter((concept): concept is Concept => concept !== undefined);
    lintLesson(lesson, lessonConcepts).forEach((hit) => failures.push(finding(6, where, `${hit.path}: jargon '${hit.match}' (term '${hit.term}') before the reveal step`)));

    lesson.deepDive?.limits.forEach((limit) => {
      const source = sources.get(limit.sourceId);
      if (source && tierPriority[source.tier] > config.maxLimitSourceTierPriority) {
        failures.push(finding(6, where, `limit '${limit.name}' cites '${limit.sourceId}' (tier ${source.tier}); taught limits need tier priority 1-${config.maxLimitSourceTierPriority}`));
      }
    });

    checkDate(where, lesson.verification.lastVerified);

    if (lesson.verification.status === 'verified') {
      for (const id of lesson.sources) {
        const source = sources.get(id);
        if (!source) continue;
        if (source.status === 'unverified') failures.push(finding(6, where, `verified lesson cites unverified source '${id}'`));
        if (source.status === 'documentation_changed' && source.changeNote && source.changeNote.since >= lesson.verification.lastVerified) {
          warnings.push(finding(6, where, `verified lesson cites '${id}' whose documentation changed ${source.changeNote.since} (lesson verified ${lesson.verification.lastVerified}); re-verify`));
        }
      }
    }
  }

  for (const template of registry.WEEKLY_TEMPLATES) {
    checkDate(`weekly template ${template.id}`, template.verification.lastVerified);
  }
  return { failures, warnings };
}

// 7. Exercise depth/dimension coverage per lesson and engine depth ranges per exercise type.
export function checkExerciseCoverage(registry: Registry, options: IntegrityOptions): Finding[] {
  const config = options.config ?? CURRICULUM_CONFIG;
  const findings: Finding[] = [];
  for (const lesson of registry.LESSONS) {
    const where = `lesson ${lesson.slug}`;
    if (lesson.kind === 'lesson' || lesson.kind === 'lab') {
      const dimensions = new Set(lesson.exercises.map((exercise) => exercise.dimension));
      if (dimensions.size < config.minDimensionsPerLesson) findings.push(finding(7, where, `exercises cover ${dimensions.size} dimensions (min ${config.minDimensionsPerLesson})`));
      const maxDepth = lesson.exercises.reduce((max, exercise) => Math.max(max, exercise.depth), 0);
      if (maxDepth < config.minMaxDepthPerLesson) findings.push(finding(7, where, `max exercise depth ${maxDepth} (min ${config.minMaxDepthPerLesson})`));
    }
    if (lesson.teachBack.depth < config.lessonTeachBackMinDepth) findings.push(finding(7, where, `teachBack depth ${lesson.teachBack.depth} (min ${config.lessonTeachBackMinDepth})`));
  }
  for (const { where, exercise } of conceptExercises(registry)) {
    const label = `${where} exercise ${exercise.id}`;
    if (typeof exercise.depth !== 'number' || typeof exercise.dimension !== 'string') findings.push(finding(7, label, 'every exercise carries depth and dimension'));
    if (exercise.type === 'teach_back' && (exercise.depth < config.teachBackDepth.min || exercise.depth > config.teachBackDepth.max)) {
      findings.push(finding(7, label, `teach_back depth ${exercise.depth} outside ${config.teachBackDepth.min}-${config.teachBackDepth.max}`));
    }
    if (exercise.type === 'explain_why' && (exercise.depth < config.explainWhyDepth.min || exercise.depth > config.explainWhyDepth.max)) {
      findings.push(finding(7, label, `explain_why depth ${exercise.depth} outside ${config.explainWhyDepth.min}-${config.explainWhyDepth.max}`));
    }
  }
  return findings;
}

export function runIntegrityChecks(registry: Registry, options: IntegrityOptions): IntegrityReport {
  const content = checkContentRules(registry, options);
  return {
    failures: [
      ...checkSchemas(registry, options),
      ...checkIdentity(registry, options),
      ...checkReferences(registry),
      ...checkStructure(registry, options),
      ...checkConceptCoverage(registry, options),
      ...content.failures,
      ...checkExerciseCoverage(registry, options),
    ],
    warnings: content.warnings,
  };
}

export function formatFindings(findings: readonly Finding[]): string {
  return findings.map((entry) => `[${entry.check}] ${entry.where}: ${entry.message}`).join('\n');
}
