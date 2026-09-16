// The seven integrity checks (ARCHITECTURE.md §B "curriculum.test.ts integrity checks") over the real registry in
// data/curriculum. Every check that can run with zero lessons runs now; the lesson-dependent parts are skipped with
// the reason in the test name until data/lessons is authored (next phase), and un-skip themselves automatically.
// `today` is the wall clock on purpose: the freshness rules (warnSourceAgeDays / maxSourceAgeDays, lastVerified not
// in the future) are meant to fail a stale registry in CI, not a fixed date.
import { describe, expect, it } from 'vitest';
import { CONCEPTS, LESSONS, MISSIONS, REGISTRY, RELEASES, RULE_SETS, SOURCES, WEEKLY_TEMPLATES, WORLDS } from '../../data/curriculum/index.ts';
import { RAW_ID_ALIASES, resolveSourceId } from '../../data/sources/aliases.ts';
import { SIM_IDS } from '../simulations/rule-set.ts';
import { SourceSchema } from '../sources/schema.ts';
import { tierPrefix } from '../sources/types.ts';
import { toClientExercise } from './client-view.ts';
import { CURRICULUM_CONFIG } from './config.ts';
import { createCurriculum } from './index.ts';
import {
  checkConceptCoverage,
  checkContentRules,
  checkExerciseCoverage,
  checkIdentity,
  checkReferences,
  checkSchemas,
  checkStructure,
  formatFindings,
  runIntegrityChecks,
} from './integrity.ts';
import { findJargon } from './lint.ts';
import { CONCEPT_SLUG_RE, MISSION_SLUG_RE, WEEKLY_TEMPLATE_ID_RE, WORLD_SLUG_RE } from './schema.ts';
import { buildSyncPlan, planCounts } from './sync.ts';

const today = new Date().toISOString().slice(0, 10);
const options = { today };
const config = CURRICULUM_CONFIG;

const lessonsAuthored = LESSONS.length > 0;
const NO_LESSONS = '(skipped: LESSONS is empty until the lesson phase)';
const registryComplete = LESSONS.length >= config.totalDays;
const NOT_COMPLETE = `(skipped: LESSONS.length < ${config.totalDays} until Phase 7 completes)`;

const parents = new Set(CONCEPTS.flatMap((concept) => (concept.parent !== undefined ? [concept.parent] : [])));
const leaves = CONCEPTS.filter((concept) => !parents.has(concept.slug));
const sourceIds = new Set(SOURCES.map((source) => source.id));

describe('registry shape', () => {
  it('has the six worlds, World 1 missions, World 1 concepts, every source, four releases, two weekly templates and the four simulators', () => {
    expect(WORLDS.map((world) => world.slug)).toEqual(['w1-platform', 'w2-data', 'w3-security', 'w4-automation', 'w5-integration', 'w6-architecture']);
    expect(MISSIONS.map((mission) => mission.slug)).toEqual([
      'w1-m1-the-machine',
      'w1-m2-shape-of-data',
      'w1-m3-shipping-the-blueprint',
      'w1-m4-one-transaction',
      'w1-m5-asking-and-moving-data',
      'w1-m6-who-sees-what',
    ]);
    expect(leaves.length).toBeGreaterThanOrEqual(20);
    expect(SOURCES.length).toBeGreaterThanOrEqual(146);
    expect(RELEASES.map((release) => `${release.id}=${release.apiVersion}`)).toEqual(['winter-26=65.0', 'spring-26=66.0', 'summer-26=67.0', 'winter-27=68.0']);
    expect(WEEKLY_TEMPLATES.map((template) => template.id)).toEqual(['weekly-w1-platform-ten-record-deploy', 'weekly-w1-platform-thursday-change-set']);
    expect(new Set(RULE_SETS.map((ruleSet) => ruleSet.simulation))).toEqual(new Set(SIM_IDS));
  });
});

describe('1. every record parses with its Zod schema', () => {
  it('worlds, missions, lessons, templates, concepts, sources, releases and rule sets re-parse', () => {
    expect(formatFindings(checkSchemas(REGISTRY, options))).toBe('');
  });

  it('rule set ids are <sim>@<release> and pin a release in RELEASES', () => {
    const releaseIds = new Set(RELEASES.map((release) => release.id));
    for (const ruleSet of RULE_SETS) {
      expect(ruleSet.id).toBe(`${ruleSet.simulation}@${ruleSet.release}`);
      expect(releaseIds.has(ruleSet.release)).toBe(true);
    }
  });
});

describe('2. slug regexes and uniqueness', () => {
  it('passes the identity check (uniqueness of every id kind, source prefix vs tier, core days)', () => {
    expect(formatFindings(checkIdentity(REGISTRY, options))).toBe('');
  });

  it('world, mission, concept and template ids match their regexes', () => {
    for (const world of WORLDS) expect(world.slug).toMatch(WORLD_SLUG_RE);
    for (const mission of MISSIONS) expect(mission.slug).toMatch(MISSION_SLUG_RE);
    for (const concept of CONCEPTS) expect(concept.slug).toMatch(CONCEPT_SLUG_RE);
    for (const template of WEEKLY_TEMPLATES) expect(template.id).toMatch(WEEKLY_TEMPLATE_ID_RE);
  });

  it("every source id matches ^(help|dev|arch|rn|other)-[a-z0-9-]+$ and its tier's prefix", () => {
    for (const source of SOURCES) {
      expect(SourceSchema.shape.id.safeParse(source.id).success, source.id).toBe(true);
      expect(source.id.startsWith(`${tierPrefix[source.tier]}-`), `${source.id} vs tier ${source.tier}`).toBe(true);
    }
    expect(new Set(SOURCES.map((source) => source.id)).size).toBe(SOURCES.length);
  });

  it('the raw ARCHITECTURE id aliases all resolve to registry sources and never collide with canonical ids', () => {
    for (const [raw, canonical] of Object.entries(RAW_ID_ALIASES)) {
      expect(sourceIds.has(canonical), `${raw} -> ${canonical}`).toBe(true);
      expect(sourceIds.has(raw), `raw id ${raw} must not itself be a source id`).toBe(false);
      expect(SourceSchema.shape.id.safeParse(raw).success, `raw id ${raw} must be outside the canonical regex`).toBe(false);
    }
    expect(resolveSourceId('kb-id-15-18')).toBe('help-kb-id-15-18');
    expect(resolveSourceId('dev-apex-ooe')).toBe('dev-apex-ooe');
  });

  it.skipIf(!registryComplete)(`days 1-180 are contiguous among core lessons ${NOT_COMPLETE}`, () => {
    const days = new Set(LESSONS.filter((lesson) => lesson.visibility === 'core').map((lesson) => lesson.day));
    for (let day = config.dayRange.min; day <= config.dayRange.max; day += 1) expect(days.has(day), `day ${day}`).toBe(true);
  });
});

describe('3. every reference resolves', () => {
  it('concept parents, concept and mission worlds, template concepts/sources/releases, release sources, rule-set releases and sources', () => {
    expect(formatFindings(checkReferences(REGISTRY))).toBe('');
  });

  it('rule sets cite canonical source ids (raw research ids are resolved at registry assembly)', () => {
    for (const ruleSet of RULE_SETS) {
      for (const id of ruleSet.sourceIds) expect(sourceIds.has(id), `${ruleSet.id} cites ${id}`).toBe(true);
    }
  });

  it.skipIf(!lessonsAuthored)(`lesson.concepts, exercise.concept, lesson.sources, exercise.sourceIds, releaseNotes, simulation.ruleSetId and antiPatternId ${NO_LESSONS}`, () => {
    expect(formatFindings(checkReferences(REGISTRY).filter((entry) => entry.where.startsWith('lesson ')))).toBe('');
  });
});

describe('4. structure', () => {
  it('passes the structure check', () => {
    expect(formatFindings(checkStructure(REGISTRY, options))).toBe('');
  });

  it(`every world that has concepts has >= ${config.minWeeklyTemplatesPerWorld} weekly boss templates, all of whose concepts belong to that world`, () => {
    const conceptWorld = new Map(CONCEPTS.map((concept) => [concept.slug, concept.world]));
    for (const world of WORLDS) {
      const templates = WEEKLY_TEMPLATES.filter((template) => template.world === world.slug);
      if (CONCEPTS.some((concept) => concept.world === world.slug)) {
        expect(templates.length, world.slug).toBeGreaterThanOrEqual(config.minWeeklyTemplatesPerWorld);
      }
      for (const template of templates) {
        expect(template.concepts.length).toBeGreaterThan(0);
        for (const slug of template.concepts) expect(conceptWorld.get(slug), `${template.id} -> ${slug}`).toBe(world.slug);
      }
    }
  });

  it('weekly templates reference leaf concepts only', () => {
    for (const template of WEEKLY_TEMPLATES) {
      for (const slug of template.concepts) expect(parents.has(slug), `${template.id} -> ${slug} is a parent`).toBe(false);
      expect(parents.has(template.exercise.concept)).toBe(false);
    }
  });

  it.skipIf(!lessonsAuthored)(`every mission's last core lesson is kind 'boss' and templates cover every core concept ${NO_LESSONS}`, () => {
    expect(formatFindings(checkStructure(REGISTRY, options))).toBe('');
    for (const mission of MISSIONS) {
      const core = LESSONS.filter((lesson) => lesson.mission === mission.slug && lesson.visibility === 'core' && lesson.kind !== 'capstone').sort((a, b) => a.ordinal - b.ordinal);
      if (core.length > 0) expect(core[core.length - 1].kind, mission.slug).toBe('boss');
    }
  });

  it.skipIf(!registryComplete)(`exactly one capstone at day ${config.capstoneDay} ${NOT_COMPLETE}`, () => {
    const capstones = LESSONS.filter((lesson) => lesson.kind === 'capstone');
    expect(capstones).toHaveLength(1);
    expect(capstones[0].day).toBe(config.capstoneDay);
  });
});

describe('5. concept quality', () => {
  it('passes the concept coverage check', () => {
    expect(formatFindings(checkConceptCoverage(REGISTRY, options))).toBe('');
  });

  it(`every leaf concept declares >= ${config.minMisconceptionsPerConcept} misconceptions with ids and probes`, () => {
    for (const concept of leaves) {
      expect(concept.misconceptions.length, concept.slug).toBeGreaterThanOrEqual(config.minMisconceptionsPerConcept);
      for (const entry of concept.misconceptions) {
        expect(entry.summary.length, `${concept.slug}#${entry.id}`).toBeGreaterThan(10);
        expect(entry.probe.length, `${concept.slug}#${entry.id}`).toBeGreaterThan(10);
      }
    }
  });

  it(`every leaf concept has >= ${config.minProbeAnglesPerConcept} probe angles with at least one template`, () => {
    for (const concept of leaves) {
      const angles = Object.values(concept.probes).filter((templates) => templates !== undefined && templates.length > 0).length;
      expect(angles, concept.slug).toBeGreaterThanOrEqual(config.minProbeAnglesPerConcept);
    }
  });

  it('every leaf concept carries at least one term for the reveal table and a bilingual summary', () => {
    for (const concept of leaves) {
      expect(concept.terms.length, concept.slug).toBeGreaterThan(0);
      expect(concept.summary.caveman.length, concept.slug).toBeGreaterThan(20);
      expect(concept.summary.technical.length, concept.slug).toBeGreaterThan(40);
    }
  });

  it('every parent concept has at least one child in the registry and every child parent resolves', () => {
    for (const parent of parents) expect(CONCEPTS.some((concept) => concept.slug === parent), parent).toBe(true);
    for (const concept of CONCEPTS) if (concept.parent !== undefined) expect(concept.slug.startsWith(`${concept.parent}.`), concept.slug).toBe(true);
  });

  it('every concept has skills that sum to 1 and defaults to its world skill', () => {
    const worldSkill = new Map(WORLDS.map((world) => [world.slug, world.skill]));
    for (const concept of CONCEPTS) {
      const weights = Object.values(concept.skills ?? {}) as number[];
      expect(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1), concept.slug).toBeLessThan(config.skillWeightTolerance);
      expect(concept.skills?.[worldSkill.get(concept.world)!], concept.slug).toBeGreaterThan(0);
    }
  });

  it.skipIf(!lessonsAuthored)(`every concept a lesson references has a best practice and an anti-pattern somewhere; parents are never exercise concepts ${NO_LESSONS}`, () => {
    expect(formatFindings(checkConceptCoverage(REGISTRY, options))).toBe('');
  });
});

describe('6. content rules', () => {
  it('passes the content rules check (source changeNotes, template dates, limit-grade sources); warnings are printed', () => {
    const { failures, warnings } = checkContentRules(REGISTRY, options);
    expect(formatFindings(failures)).toBe('');
    if (warnings.length > 0) console.warn(`curriculum warnings:\n${formatFindings(warnings)}`);
  });

  it('caveman summaries of every concept contain no global jargon and none of the concept\'s own terms', () => {
    for (const concept of CONCEPTS) {
      const hits = findJargon(concept.summary.caveman, concept.terms.map((entry) => entry.term));
      expect(hits.map((hit) => `${hit.term} as '${hit.match}'`), `${concept.slug}: ${concept.summary.caveman}`).toEqual([]);
    }
  });

  it('caveman prompts of weekly boss exercises contain no global jargon or template concept terms', () => {
    const bySlug = new Map(CONCEPTS.map((concept) => [concept.slug, concept]));
    for (const template of WEEKLY_TEMPLATES) {
      const prompt = template.exercise.prompt;
      if (typeof prompt === 'string') continue;
      const terms = template.concepts.flatMap((slug) => bySlug.get(slug)?.terms.map((entry) => entry.term) ?? []);
      expect(findJargon(prompt.caveman, terms).map((hit) => hit.match), template.id).toEqual([]);
    }
  });

  it("every source's verification state is coherent: verified sources are dated, unverified ones are not, stale is never authored, PDFs carry docVersion", () => {
    for (const source of SOURCES) {
      expect(source.status, source.id).not.toBe('stale');
      if (source.status === 'unverified') expect(source.lastVerified, source.id).toBeNull();
      else {
        expect(source.lastVerified, source.id).not.toBeNull();
        expect(source.lastVerified! <= today, `${source.id} lastVerified ${source.lastVerified} > today ${today}`).toBe(true);
      }
      if (source.status === 'documentation_changed') expect(source.changeNote, source.id).toBeDefined();
      if (source.url.toLowerCase().endsWith('.pdf')) expect(source.docVersion, source.id).toBeTruthy();
      expect(typeof source.fetchedOk, `${source.id} records fetch provenance`).toBe('boolean');
    }
  });

  it("every release's sourceId is a trust_release source and its notesUrl is a release-notes page", () => {
    const bySlug = new Map(SOURCES.map((source) => [source.id, source]));
    for (const release of RELEASES) {
      expect(bySlug.get(release.sourceId)?.tier, release.id).toBe('trust_release');
      expect(release.notesUrl, release.id).toContain('release-notes');
    }
  });

  it.skipIf(!lessonsAuthored)(`jargon lint, limit-grade sources and the verified-lesson source rules over every lesson ${NO_LESSONS}`, () => {
    expect(formatFindings(checkContentRules(REGISTRY, options).failures)).toBe('');
  });
});

describe('7. exercise depth and dimension coverage', () => {
  it('weekly boss exercises carry depth and dimension and pass the exercise coverage check', () => {
    expect(formatFindings(checkExerciseCoverage(REGISTRY, options))).toBe('');
    for (const template of WEEKLY_TEMPLATES) {
      expect(template.exercise.type).toBe('boss');
      expect(template.exercise.depth).toBeGreaterThanOrEqual(config.minMaxDepthPerLesson);
      expect(template.exercise.dimension).toBe('debugging');
      expect(Object.keys(template.exercise.rubricKeyPoints).sort()).toEqual(['dataNeeded', 'solution', 'suspect', 'tradeOffs', 'whatToInspect', 'why']);
    }
  });

  it('weekly boss rubric key points never reach the client projection', () => {
    for (const template of WEEKLY_TEMPLATES) {
      const json = JSON.stringify(toClientExercise(template.exercise));
      expect(json).not.toContain('rubricKeyPoints');
      expect(json).toContain('"incident"');
    }
  });

  it.skipIf(!lessonsAuthored)(`>= ${config.minDimensionsPerLesson} dimensions, max depth >= ${config.minMaxDepthPerLesson}, teachBack depth >= ${config.lessonTeachBackMinDepth} per lesson ${NO_LESSONS}`, () => {
    expect(formatFindings(checkExerciseCoverage(REGISTRY, options))).toBe('');
  });
});

describe('all seven checks together', () => {
  it('report no failures over the registry', () => {
    const report = runIntegrityChecks(REGISTRY, options);
    expect(formatFindings(report.failures)).toBe('');
  });
});

describe('sync round-trip', () => {
  it('derives registry rows idempotently with the expected counts', () => {
    const plan = buildSyncPlan(REGISTRY);
    expect(buildSyncPlan(REGISTRY)).toEqual(plan);
    expect(planCounts(plan)).toEqual({
      worlds: WORLDS.length,
      missions: MISSIONS.length,
      skills: 6,
      concepts: CONCEPTS.length,
      lessons: LESSONS.length,
      lesson_concepts: LESSONS.reduce((sum, lesson) => sum + new Set(lesson.concepts).size, 0),
      concept_skills: CONCEPTS.length, // every World 1 concept carries a single skill weight today
    });
    expect(plan.concepts.slice(0, parents.size).every((row) => row.parent_id === null)).toBe(true); // parents first
  });
});

describe('loaders over the registry', () => {
  const curriculum = createCurriculum(REGISTRY);

  it('getWorld / getMission / getConceptTree / getWeeklyTemplates / getExercise / getRuleSet', () => {
    const world = curriculum.getWorld('w1-platform');
    expect(world?.missions.map((entry) => entry.mission.slug)).toEqual(MISSIONS.map((mission) => mission.slug));
    expect(world?.concepts).toHaveLength(CONCEPTS.length);
    expect(curriculum.getWorld('w9-nope')).toBeNull();
    expect(curriculum.getMission('w1-m1-the-machine')?.bossLesson).toBeNull(); // authored in the lesson phase
    const tree = curriculum.getConceptTree('w1-platform');
    expect(tree.map((node) => node.concept.slug)).toEqual([...parents].sort());
    expect(tree.flatMap((node) => node.children).every((node) => node.isLeaf)).toBe(true);
    expect(tree.flatMap((node) => node.children)).toHaveLength(leaves.length);
    expect(curriculum.getWeeklyTemplates('w1-platform').map((template) => template.id)).toEqual(WEEKLY_TEMPLATES.map((template) => template.id));
    expect(curriculum.getWeeklyTemplates('w2-data')).toEqual([]);
    expect(curriculum.getExercise('weekly-w1-platform-ten-record-deploy/incident')).toMatchObject({ lessonSlug: null, templateId: 'weekly-w1-platform-ten-record-deploy' });
    expect(curriculum.getRuleSet('governor-limits@winter-27')?.release).toBe('winter-27');
    expect(curriculum.getRuleSet('not-a-rule-set')).toBeNull();
    expect(curriculum.getLesson('d001-nothing-yet', today)).toBeNull();
    expect(curriculum.listWorlds().map((world) => world.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
