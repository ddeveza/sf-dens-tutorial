import { describe, expect, it } from 'vitest';
import { FIXTURE_LESSON, FIXTURE_TEMPLATES, FIXTURE_WORLD, buildFixtureLessonInput } from '../../tests/fixtures/lesson-fixture.ts';
import {
  CurriculumAuthoringError,
  boss,
  defineConcept,
  defineLesson,
  defineMission,
  defineWeeklyBoss,
  defineWorld,
  explainWhy,
  lessonExercises,
  mcq,
  namespaceExerciseId,
  teachBack,
} from './builders.ts';
import { CURRICULUM_CONFIG } from './config.ts';

const TODAY = '2026-09-11';

function expectAuthoringError(fn: () => unknown, ...fragments: string[]): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CurriculumAuthoringError);
  const message = (caught as Error).message;
  for (const fragment of fragments) expect(message).toContain(fragment);
}

describe('defineLesson defaults', () => {
  it('fills estimatedMinutes 60, visibility core and unlock previous_complete when the author omits them', () => {
    const input = buildFixtureLessonInput();
    expect(input.estimatedMinutes).toBeUndefined();
    expect(input.visibility).toBeUndefined();
    expect(input.unlock).toBeUndefined();
    expect(FIXTURE_LESSON.estimatedMinutes).toBe(CURRICULUM_CONFIG.defaultEstimatedMinutes);
    expect(FIXTURE_LESSON.estimatedMinutes).toBe(60);
    expect(FIXTURE_LESSON.visibility).toBe('core');
    expect(FIXTURE_LESSON.unlock).toEqual({ type: 'previous_complete' });
    expect(FIXTURE_LESSON.releaseNotes.length).toBeGreaterThan(0);
  });

  it('keeps explicit values over the defaults', () => {
    const lesson = defineLesson({ ...buildFixtureLessonInput(), estimatedMinutes: 25, kind: 'lab' }, { today: TODAY });
    expect(lesson.estimatedMinutes).toBe(25);
    expect(lesson.kind).toBe('lab');
  });

  it('turns a plain Markdown explanation into one paragraph block', () => {
    const lesson = defineLesson(
      { ...buildFixtureLessonInput(), explanation: { caveman: 'One block.', technical: 'One block.', reveal: [] } },
      { today: TODAY },
    );
    expect(lesson.explanation.caveman).toEqual([{ kind: 'paragraph', text: 'One block.' }]);
  });
});

describe('explainWhy llm default', () => {
  const base = { id: 'why', concept: 'fixture.boundaries', dimension: 'understanding' as const, prompt: 'Why?', keyPoints: ['because'] };

  it('is check below explainWhyProbeFromDepth and probe at or above it', () => {
    expect(CURRICULUM_CONFIG.explainWhyProbeFromDepth).toBe(3);
    expect(explainWhy({ ...base, depth: 2 }).llm).toBe('check');
    expect(explainWhy({ ...base, depth: 3 }).llm).toBe('probe');
    expect(explainWhy({ ...base, depth: 4 }).llm).toBe('probe');
  });

  it('respects an explicit llm', () => {
    expect(explainWhy({ ...base, depth: 4, llm: 'check' }).llm).toBe('check');
  });

  it('rejects depths outside the engine range 2-4, naming the exercise', () => {
    expectAuthoringError(() => explainWhy({ ...base, depth: 5 }), "exercise 'why'", 'explain_why depth must be 2-4');
  });
});

describe('defineConcept', () => {
  const summary = { caveman: 'A small idea.', technical: 'A concept.' };

  it('defaults skills to { [world.skill]: 1 } from the World record', () => {
    const concept = defineConcept({ slug: 'thing', world: FIXTURE_WORLD, title: 'Thing', summary, terms: [], misconceptions: [], probes: {} });
    expect(concept.world).toBe('w1-fixture');
    expect(concept.skills).toEqual({ platform: 1 });
  });

  it('refuses a world slug string without explicit skills, but accepts it with them', () => {
    expectAuthoringError(
      () => defineConcept({ slug: 'thing', world: 'w1-fixture', title: 'Thing', summary, terms: [], misconceptions: [], probes: {} }),
      "concept 'thing'",
      'pass the World record',
    );
    const concept = defineConcept({ slug: 'thing', world: 'w1-fixture', skills: { data: 0.5, apex: 0.5 }, title: 'Thing', summary, terms: [], misconceptions: [], probes: {} });
    expect(concept.skills).toEqual({ data: 0.5, apex: 0.5 });
  });

  it('defaults parent from the dotted slug and leaves roots parentless', () => {
    const leaf = defineConcept({ slug: 'soql.selectivity', world: FIXTURE_WORLD, title: 'Selectivity', summary, terms: [], misconceptions: [], probes: {} });
    expect(leaf.parent).toBe('soql');
    const root = defineConcept({ slug: 'soql', world: FIXTURE_WORLD, title: 'SOQL', summary, terms: [], misconceptions: [], probes: {} });
    expect(root.parent).toBeUndefined();
  });

  it('rejects skill weights that do not sum to 1, naming the slug', () => {
    expectAuthoringError(
      () => defineConcept({ slug: 'thing', world: FIXTURE_WORLD, skills: { platform: 0.5, data: 0.4 }, title: 'Thing', summary, terms: [], misconceptions: [], probes: {} }),
      "concept 'thing'",
      'skills weights must sum to 1',
    );
  });

  it('rejects duplicate misconception ids', () => {
    expectAuthoringError(
      () =>
        defineConcept({
          slug: 'thing',
          world: FIXTURE_WORLD,
          title: 'Thing',
          summary,
          terms: [],
          misconceptions: [
            { id: 'dup', summary: 'a', probe: 'a?' },
            { id: 'dup', summary: 'b', probe: 'b?' },
          ],
          probes: {},
        }),
      "concept 'thing'",
      "duplicate misconception id 'dup'",
    );
  });
});

describe('exercise id namespacing', () => {
  it("namespaces every lesson exercise as '<lesson-slug>/<local-id>'", () => {
    for (const exercise of lessonExercises(FIXTURE_LESSON)) {
      expect(exercise.id.startsWith('d001-fixture-lesson/')).toBe(true);
    }
    expect(FIXTURE_LESSON.exercises[0].id).toBe('d001-fixture-lesson/all-or-nothing');
    expect(FIXTURE_LESSON.scenario.id).toBe('d001-fixture-lesson/half-saved-invoices');
    expect(FIXTURE_LESSON.teachBack.id).toBe('d001-fixture-lesson/teach-junior');
  });

  it("namespaces weekly boss exercises as '<template-id>/<local-id>'", () => {
    expect(FIXTURE_TEMPLATES[0].exercise.id).toBe('weekly-w1-fixture-drill/drill');
  });

  it('passes an already-namespaced own id through and rejects foreign namespaces and index ids', () => {
    expect(namespaceExerciseId('d001-x', 'd001-x/local', 'lesson')).toBe('d001-x/local');
    expect(() => namespaceExerciseId('d001-x', 'd002-y/local', "lesson 'd001-x'")).toThrow(/belongs to another namespace/);
    expect(() => namespaceExerciseId('d001-x', '3', "lesson 'd001-x'")).toThrow(/index-based exercise id '3' is forbidden/);
    expect(() => namespaceExerciseId('d001-x', 'Bad_Id', "lesson 'd001-x'")).toThrow(/lowercase hyphenated word/);
  });

  it('rejects an index-based id even before namespacing (schema level)', () => {
    expectAuthoringError(
      () => mcq({ id: '0', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' }),
      "exercise '0'",
      'index-based exercise ids are forbidden',
    );
  });
});

describe('every refinement failure names the slug', () => {
  const input = () => buildFixtureLessonInput();

  it('missing deepDive on a lesson', () => {
    expectAuthoringError(() => defineLesson({ ...input(), deepDive: undefined }, { today: TODAY }), "lesson 'd001-fixture-lesson'", 'deepDive is required');
  });

  it('teach-back below lessonTeachBackMinDepth', () => {
    const shallow = teachBack({ id: 'teach-junior', concept: 'fixture.boundaries', dimension: 'teach_back', depth: 4, prompt: 'p', audience: 'junior_dev', keyPoints: ['k'] });
    expectAuthoringError(() => defineLesson({ ...input(), teachBack: shallow }, { today: TODAY }), "lesson 'd001-fixture-lesson'", 'teach-back depth must be >= 5');
  });

  it('slug day prefix must equal day', () => {
    expectAuthoringError(() => defineLesson({ ...input(), day: 2 }, { today: TODAY }), "lesson 'd001-fixture-lesson'", 'slug day prefix must equal day 2');
  });

  it("boss lesson slug must be 'boss-<mission>'", () => {
    expectAuthoringError(
      () => defineLesson({ ...input(), kind: 'boss', slug: 'boss-wrong', exercises: [boss({ id: 'b', concept: 'fixture.boundaries', dimension: 'debugging', depth: 6, prompt: 'p', incident: 'i', rubricKeyPoints: { suspect: ['s'], why: ['w'], dataNeeded: ['d'], whatToInspect: ['i'], solution: ['s'], tradeOffs: ['t'] } })] }, { today: TODAY }),
      "lesson 'boss-wrong'",
      "boss lesson slug must be 'boss-w1-m1-fixture'",
    );
  });

  it('hidden visibility needs a hidden unlock (and vice versa)', () => {
    expectAuthoringError(() => defineLesson({ ...input(), visibility: 'hidden' }, { today: TODAY }), "lesson 'd001-fixture-lesson'", "hidden lessons need unlock { type: 'hidden' }");
    expectAuthoringError(
      () => defineLesson({ ...input(), unlock: { type: 'hidden', concept: 'fixture.boundaries', min: 'competent' } }, { today: TODAY }),
      "lesson 'd001-fixture-lesson'",
      "unlock 'hidden' requires visibility 'hidden'",
    );
  });

  it('duplicate exercise ids', () => {
    const base = input();
    const dup = mcq({ id: 'all-or-nothing', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' });
    expectAuthoringError(() => defineLesson({ ...base, exercises: [...(base.exercises ?? []), dup] }, { today: TODAY }), "lesson 'd001-fixture-lesson'", "duplicate exercise id 'd001-fixture-lesson/all-or-nothing'");
  });

  it('too few dimensions or too shallow exercises', () => {
    const base = input();
    const only = mcq({ id: 'solo', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' });
    expectAuthoringError(() => defineLesson({ ...base, exercises: [only] }, { today: TODAY }), "lesson 'd001-fixture-lesson'", 'distinct dimensions', 'depth >= 4');
  });

  it('lastVerified in the future relative to the injected today, or not a calendar date', () => {
    const base = input();
    expectAuthoringError(
      () => defineLesson({ ...base, verification: { ...base.verification, lastVerified: '2026-09-12' } }, { today: TODAY }),
      "lesson 'd001-fixture-lesson'",
      'lastVerified 2026-09-12 is after today 2026-09-11',
    );
    expectAuthoringError(
      () => defineLesson({ ...base, verification: { ...base.verification, lastVerified: '2026-02-30' } }, { today: TODAY }),
      "lesson 'd001-fixture-lesson'",
      "'2026-02-30' is not a calendar date",
    );
  });

  it('a boss/capstone exercise inside an ordinary lesson', () => {
    const base = input();
    const stray = boss({ id: 'stray', concept: 'fixture.boundaries', dimension: 'debugging', depth: 6, prompt: 'p', incident: 'i', rubricKeyPoints: { suspect: ['s'], why: ['w'], dataNeeded: ['d'], whatToInspect: ['i'], solution: ['s'], tradeOffs: ['t'] } });
    expectAuthoringError(() => defineLesson({ ...base, exercises: [...(base.exercises ?? []), stray] }, { today: TODAY }), "lesson 'd001-fixture-lesson'", "'boss' exercises belong only to boss lessons");
  });

  it('mcq answer must index options, naming the exercise', () => {
    expectAuthoringError(
      () => mcq({ id: 'oob', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'p', options: ['a', 'b'], answer: 2, explain: 'e' }),
      "exercise 'oob'",
      'answer must index options',
    );
  });

  it('weekly boss template: id prefix, namespaced exercise, world', () => {
    const template = FIXTURE_TEMPLATES[0];
    expectAuthoringError(() => defineWeeklyBoss({ ...template, id: 'weekly-w2-other', exercise: { ...template.exercise, id: 'drill' } }), "weekly boss 'weekly-w2-other'", "id must start with 'weekly-w1-'");
    expectAuthoringError(() => defineWeeklyBoss({ ...template, exercise: { ...template.exercise, id: 'weekly-w1-other/drill' } }), "weekly boss 'weekly-w1-fixture-drill'", 'belongs to another namespace');
  });

  it('world and mission slug conventions', () => {
    expectAuthoringError(() => defineWorld({ slug: 'w2-fixture', ordinal: 1, title: 'X', skill: 'platform' }), "world 'w2-fixture'", 'ordinal must match');
    expectAuthoringError(() => defineMission({ slug: 'w2-m1-x', world: 'w1-fixture', ordinal: 1, title: 'X' }), "mission 'w2-m1-x'", "slug must start with 'w1-m'");
    expectAuthoringError(() => defineMission({ slug: 'w1-m2-x', world: 'w1-fixture', ordinal: 1, title: 'X' }), "mission 'w1-m2-x'", 'ordinal must match the m<n> slug segment');
  });
});
