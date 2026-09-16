// Each of the seven integrity checks catches its violation on the fixture registry; curriculum.test.ts runs the same
// functions over data/curriculum. `today` is injected; nothing here reads the clock.
import { describe, expect, it } from 'vitest';
import { FIXTURE_LESSON, FIXTURE_REGISTRY, FIXTURE_TEMPLATES, cloneFixtureRegistry } from '../../tests/fixtures/lesson-fixture.ts';
import { defineSource } from '../sources/builders.ts';
import { defineLesson, mcq } from './builders.ts';
import type { Registry } from './registry.ts';
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

const TODAY = '2026-09-11';
const options = { today: TODAY };

function withLesson(registry: Registry, patch: Partial<typeof FIXTURE_LESSON>): Registry {
  return { ...registry, LESSONS: registry.LESSONS.map((lesson) => (lesson.slug === FIXTURE_LESSON.slug ? { ...lesson, ...patch } : lesson)) };
}

describe('the fixture registry', () => {
  it('passes all seven checks with no failures and no warnings', () => {
    const report = runIntegrityChecks(FIXTURE_REGISTRY, options);
    expect(formatFindings(report.failures)).toBe('');
    expect(report.warnings).toEqual([]);
  });
});

describe('1. schemas', () => {
  it('catches a hand-edited lesson, source and rule set', () => {
    const registry = cloneFixtureRegistry();
    registry.LESSONS = [{ ...FIXTURE_LESSON, day: 0 }];
    registry.SOURCES = [...registry.SOURCES, { ...registry.SOURCES[0], id: 'bad id' }];
    registry.RULE_SETS = [{ ...registry.RULE_SETS[0], apiVersion: 'v67' }];
    const findings = checkSchemas(registry, options);
    expect(findings.map((entry) => entry.where)).toEqual(['lesson d001-fixture-lesson', 'source bad id', 'rule set governor-limits@summer-26']);
    expect(findings.every((entry) => entry.check === 1)).toBe(true);
  });
});

describe('2. identity', () => {
  it('catches duplicate slugs, exercise ids across lessons and templates, and mismatched source prefixes', () => {
    const registry = cloneFixtureRegistry();
    registry.LESSONS = [...registry.LESSONS, FIXTURE_LESSON];
    registry.SOURCES = [...registry.SOURCES, { ...registry.SOURCES[0], id: 'dev-fixture-basics', tier: 'help' }];
    const messages = checkIdentity(registry, options).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toContain("lessons: duplicate 'd001-fixture-lesson'");
    expect(messages).toContain("exercises: duplicate 'd001-fixture-lesson/all-or-nothing'");
    expect(messages).toContain("core lesson days: duplicate '1'");
    expect(messages).toContain("source dev-fixture-basics: id prefix must match tier 'help'");
  });

  it('skips the 1-180 contiguity rule until the registry is complete', () => {
    expect(checkIdentity(FIXTURE_REGISTRY, options)).toEqual([]);
  });
});

describe('3. references', () => {
  it('catches every unresolved reference kind', () => {
    const registry = cloneFixtureRegistry();
    const broken = withLesson(registry, {
      concepts: ['fixture.boundaries', 'nowhere'],
      sources: ['help-fixture-basics', 'help-missing'],
      simulation: { id: 'sharing', ruleSetId: 'governor-limits@summer-26', preset: 'x' },
      exercises: [
        ...FIXTURE_LESSON.exercises,
        mcq({ id: 'd001-fixture-lesson/ghost', concept: 'ghost.concept', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e', sourceIds: ['dev-none'] }),
      ],
    });
    broken.WEEKLY_TEMPLATES = [{ ...FIXTURE_TEMPLATES[0], concepts: ['fixture.elsewhere'] }];
    broken.CONCEPTS = [...broken.CONCEPTS, { ...broken.CONCEPTS[1], slug: 'lonely.leaf', parent: 'lonely' }];
    const messages = checkReferences(broken).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toContain("lesson d001-fixture-lesson: concept 'nowhere' does not resolve");
    expect(messages).toContain("lesson d001-fixture-lesson: source 'help-missing' does not resolve");
    expect(messages).toContain("lesson d001-fixture-lesson: rule set 'governor-limits@summer-26' is for 'governor-limits', not 'sharing'");
    expect(messages).toContain("lesson d001-fixture-lesson exercise d001-fixture-lesson/ghost: concept 'ghost.concept' does not resolve");
    expect(messages).toContain("lesson d001-fixture-lesson exercise d001-fixture-lesson/ghost: source 'dev-none' does not resolve");
    expect(messages).toContain("weekly template weekly-w1-fixture-drill: concept 'fixture.elsewhere' does not resolve");
    expect(messages).toContain("concept lonely.leaf: parent 'lonely' does not resolve");
  });

  it('catches a find_anti_pattern pointing at no anti-pattern and a mission in another world', () => {
    const registry = cloneFixtureRegistry();
    registry.LESSONS = registry.LESSONS.map((lesson) => ({ ...lesson, antiPatterns: lesson.antiPatterns.filter((entry) => entry.id !== 'swallowed-exception') }));
    registry.MISSIONS = [{ ...registry.MISSIONS[0], world: 'w1-fixture' }, { slug: 'w2-m1-x', world: 'w2-x', ordinal: 1, title: 'X' }];
    const messages = checkReferences(registry).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toContain("lesson d001-fixture-lesson exercise d001-fixture-lesson/spot-swallow: anti-pattern 'swallowed-exception' does not resolve");
    expect(messages).toContain("mission w2-m1-x: world 'w2-x' does not resolve");
  });
});

describe('4. structure', () => {
  it('a mission whose last core lesson is not a boss, and a world without enough templates', () => {
    const registry = cloneFixtureRegistry();
    registry.LESSONS = registry.LESSONS.filter((lesson) => lesson.kind !== 'boss');
    registry.WEEKLY_TEMPLATES = [FIXTURE_TEMPLATES[0]];
    const messages = checkStructure(registry, options).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toContain("mission w1-m1-fixture: last core lesson 'd001-fixture-lesson' must be kind 'boss' (got 'lesson')");
    expect(messages).toContain('world w1-fixture: needs >= 2 weekly boss templates (got 1)');
  });

  it('template coverage of core concepts and world membership', () => {
    const registry = cloneFixtureRegistry();
    registry.WEEKLY_TEMPLATES = FIXTURE_TEMPLATES.map((template) => ({ ...template, concepts: ['fixture.boundaries'] }));
    const messages = checkStructure(registry, options).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toEqual(["world w1-fixture: core concept 'fixture.savepoints' is covered by no weekly boss template"]);
    const foreign = cloneFixtureRegistry();
    foreign.WORLDS = [...foreign.WORLDS, { slug: 'w2-other', ordinal: 2, title: 'Other', skill: 'data' }];
    foreign.CONCEPTS = [...foreign.CONCEPTS, { ...foreign.CONCEPTS[1], slug: 'elsewhere', parent: undefined, world: 'w2-other' }];
    foreign.WEEKLY_TEMPLATES = [...FIXTURE_TEMPLATES, { ...FIXTURE_TEMPLATES[0], id: 'weekly-w2-other-x', world: 'w2-other', concepts: ['fixture.boundaries'], exercise: { ...FIXTURE_TEMPLATES[0].exercise, id: 'weekly-w2-other-x/drill' } }];
    const foreignMessages = checkStructure(foreign, options).map((entry) => `${entry.where}: ${entry.message}`);
    expect(foreignMessages).toContain("weekly template weekly-w2-other-x: concept 'fixture.boundaries' belongs to world 'w1-fixture', not 'w2-other'");
    expect(foreignMessages).toContain('world w2-other: needs >= 2 weekly boss templates (got 1)'); // the world has a concept, so the minimum applies
  });

  it('exactly one capstone at day 180', () => {
    const registry = cloneFixtureRegistry();
    const capstone = registry.LESSONS.find((lesson) => lesson.kind === 'capstone')!;
    registry.LESSONS = [...registry.LESSONS, { ...capstone, slug: 'capstone-two', day: 179 }];
    const messages = checkStructure(registry, options).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toContain('capstone: exactly one capstone lesson (got 2)');
    expect(messages).toContain('lesson capstone-two: capstone must be day 180');
  });
});

describe('5. concept coverage', () => {
  it('a referenced concept without best practice, anti-pattern, misconceptions or probe angles', () => {
    const registry = cloneFixtureRegistry();
    registry.CONCEPTS = registry.CONCEPTS.map((concept) => (concept.slug === 'fixture.savepoints' ? { ...concept, misconceptions: [concept.misconceptions[0]], probes: { why: ['w'] } } : concept));
    registry.LESSONS = registry.LESSONS.map((lesson) => ({
      ...lesson,
      bestPractices: lesson.bestPractices.filter((entry) => entry.concept !== 'fixture.savepoints'),
      antiPatterns: lesson.antiPatterns.filter((entry) => entry.concept !== 'fixture.savepoints'),
    }));
    const messages = checkConceptCoverage(registry, options).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toEqual([
      'concept fixture.savepoints: no best practice anywhere in the registry',
      'concept fixture.savepoints: no anti-pattern anywhere in the registry',
      'concept fixture.savepoints: needs >= 2 misconceptions (got 1)',
      'concept fixture.savepoints: needs >= 2 probe angles with a template (got 1)',
    ]);
  });

  it('a parent concept used by a lesson or an exercise', () => {
    const registry = withLesson(cloneFixtureRegistry(), {
      concepts: ['fixture', 'fixture.boundaries'],
      exercises: [...FIXTURE_LESSON.exercises, mcq({ id: 'd001-fixture-lesson/parent', concept: 'fixture', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' })],
    });
    const messages = checkConceptCoverage(registry, options).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toContain("lesson d001-fixture-lesson: concept 'fixture' has children; lessons list leaves only");
    expect(messages).toContain("lesson d001-fixture-lesson exercise d001-fixture-lesson/parent: concept 'fixture' has children; parents aggregate from descendants");
  });
});

describe('6. content rules', () => {
  it('jargon before the reveal, an other-tier limit source, and an unverified source under a verified lesson', () => {
    const registry = cloneFixtureRegistry();
    registry.SOURCES = [...registry.SOURCES, defineSource({ id: 'dev-fixture-unverified', title: 'U', url: 'https://developer.example.com/u', tier: 'developer', lastVerified: null, status: 'unverified' })];
    const broken = withLesson(registry, {
      curiosity: { caveman: 'The sandbox transaction.', technical: 'x' },
      deepDive: { ...FIXTURE_LESSON.deepDive!, limits: [{ name: 'Rows', value: '50,000', sourceId: 'other-fixture-blog' }] },
      sources: [...FIXTURE_LESSON.sources, 'dev-fixture-unverified'],
    });
    const { failures, warnings } = checkContentRules(broken, options);
    const messages = failures.map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toContain("lesson d001-fixture-lesson: curiosity.caveman: jargon 'sandbox' (term 'sandbox') before the reveal step");
    expect(messages).toContain("lesson d001-fixture-lesson: curiosity.caveman: jargon 'transaction' (term 'transaction') before the reveal step");
    expect(messages).toContain("lesson d001-fixture-lesson: limit 'Rows' cites 'other-fixture-blog' (tier other); taught limits need tier priority 1-3");
    expect(messages).toContain("lesson d001-fixture-lesson: verified lesson cites unverified source 'dev-fixture-unverified'");
    expect(warnings).toEqual([]);
  });

  it('a documentation_changed source newer than a verified lesson is a warning, not a failure', () => {
    const registry = withLesson(cloneFixtureRegistry(), { verification: { ...FIXTURE_LESSON.verification, lastVerified: '2026-08-01' } });
    const { failures, warnings } = checkContentRules(registry, options);
    expect(failures).toEqual([]);
    expect(warnings.map((entry) => entry.message)).toEqual(["verified lesson cites 'arch-fixture-changed' whose documentation changed 2026-08-15 (lesson verified 2026-08-01); re-verify"]);
  });

  it('dates: future, too old (failure) and ageing (warning); a documentation_changed source needs a changeNote', () => {
    const future = withLesson(cloneFixtureRegistry(), { verification: { ...FIXTURE_LESSON.verification, lastVerified: '2026-09-12' } });
    expect(checkContentRules(future, options).failures.map((entry) => entry.message)).toContain('lastVerified 2026-09-12 is after today 2026-09-11');
    const ageing = checkContentRules(FIXTURE_REGISTRY, { today: '2027-03-15' });
    expect(ageing.failures).toEqual([]);
    expect(ageing.warnings.some((entry) => entry.message.includes('days old (warn after 180)'))).toBe(true);
    const tooOld = checkContentRules(FIXTURE_REGISTRY, { today: '2027-09-15' });
    expect(tooOld.failures.some((entry) => entry.message.includes('days old (max 365)'))).toBe(true);
    const registry = cloneFixtureRegistry();
    registry.SOURCES = registry.SOURCES.map((source) => (source.id === 'arch-fixture-changed' ? { ...source, changeNote: undefined } : source));
    expect(checkContentRules(registry, options).failures.map((entry) => `${entry.where}: ${entry.message}`)).toContain('source arch-fixture-changed: documentation_changed requires a changeNote');
  });
});

describe('7. exercise coverage', () => {
  it('too few dimensions, too shallow, and engine depth ranges per exercise type', () => {
    const explainWhy = FIXTURE_LESSON.exercises.find((exercise) => exercise.type === 'explain_why')!;
    const registry = withLesson(cloneFixtureRegistry(), {
      exercises: [
        mcq({ id: 'd001-fixture-lesson/only', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' }),
        { ...explainWhy, id: 'd001-fixture-lesson/deep-why', depth: 5 },
      ],
    });
    const messages = checkExerciseCoverage(registry, options).map((entry) => `${entry.where}: ${entry.message}`);
    expect(messages).toContain('lesson d001-fixture-lesson: exercises cover 2 dimensions (min 3)');
    expect(messages.some((message) => message.includes('max exercise depth'))).toBe(false); // depth 5 satisfies the floor of 4
    expect(messages).toContain('lesson d001-fixture-lesson exercise d001-fixture-lesson/deep-why: explain_why depth 5 outside 2-4');

    const shallow = withLesson(cloneFixtureRegistry(), {
      exercises: [
        mcq({ id: 'd001-fixture-lesson/only', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' }),
        { ...FIXTURE_LESSON.teachBack, id: 'd001-fixture-lesson/deep-teach', depth: 8 },
        { ...explainWhy, id: 'd001-fixture-lesson/why', depth: 2 },
      ],
    });
    const shallowMessages = checkExerciseCoverage(shallow, options).map((entry) => entry.message);
    expect(shallowMessages).not.toContain('max exercise depth 8 (min 4)');
    expect(shallowMessages.some((message) => message.includes('teach_back depth 8 outside'))).toBe(false); // 8 is inside the engine range 2-8
    const tooShallow = withLesson(cloneFixtureRegistry(), {
      exercises: [
        mcq({ id: 'd001-fixture-lesson/a', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' }),
        mcq({ id: 'd001-fixture-lesson/b', concept: 'fixture.boundaries', dimension: 'understanding', depth: 2, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' }),
        mcq({ id: 'd001-fixture-lesson/c', concept: 'fixture.boundaries', dimension: 'application', depth: 3, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' }),
      ],
    });
    expect(checkExerciseCoverage(tooShallow, options).map((entry) => entry.message)).toContain('max exercise depth 3 (min 4)');
  });

  it('a lesson teach-back below the floor', () => {
    const registry = withLesson(cloneFixtureRegistry(), { teachBack: { ...FIXTURE_LESSON.teachBack, depth: 4 } });
    expect(checkExerciseCoverage(registry, options).map((entry) => entry.message)).toContain('teachBack depth 4 (min 5)');
  });
});

describe('formatFindings', () => {
  it('renders one line per finding with the check number', () => {
    expect(formatFindings([{ check: 3, where: 'lesson x', message: 'boom' }])).toBe('[3] lesson x: boom');
  });
});

describe('defineLesson + integrity agree on the fixture', () => {
  it('re-parsing the fixture through defineLesson yields an identical object', () => {
    expect(defineLesson(FIXTURE_LESSON, options)).toEqual(FIXTURE_LESSON);
  });
});
