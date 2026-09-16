import { describe, expect, it } from 'vitest';
import { FIXTURE_BOSS_LESSON, FIXTURE_CAPSTONE_LESSON, FIXTURE_LESSON, FIXTURE_TEMPLATES, SENTINEL } from '../../tests/fixtures/lesson-fixture.ts';
import { SECRET_FIELDS, findSecretKeys, toClientExercise, toClientLesson } from './client-view.ts';
import { lessonExercises } from './builders.ts';
import { EXERCISE_TYPES } from './schema.ts';

/** JSON object keys named like a secret field: `"answer":`, `"keyPoints":` ... (values may legitimately contain the words). */
const SECRET_KEY_RE = new RegExp(`"(${SECRET_FIELDS.join('|')})"\\s*:`);

const LESSONS = [FIXTURE_LESSON, FIXTURE_BOSS_LESSON, FIXTURE_CAPSTONE_LESSON];

describe('toClientLesson', () => {
  it('the server-side fixture really carries the sentinel and secret keys (so the assertions below have teeth)', () => {
    for (const lesson of LESSONS) {
      const json = JSON.stringify(lesson);
      expect(json).toContain(SENTINEL);
      expect(SECRET_KEY_RE.test(json)).toBe(true);
      expect(findSecretKeys(lesson).length).toBeGreaterThan(0);
    }
  });

  it.each(LESSONS.map((lesson) => [lesson.slug, lesson] as const))('%s: no secret field name and no sentinel survive serialization', (_slug, lesson) => {
    const client = toClientLesson(lesson);
    const json = JSON.stringify(client);
    expect(json).not.toContain(SENTINEL);
    // Structural check over the whole lesson (only the learner-facing explanation.reveal bridge table is exempt) ...
    expect(findSecretKeys(client)).toEqual([]);
    // ... and a raw key-name check over the subtrees where answer keys live: no exemption applies there.
    expect(JSON.stringify(client.exercises)).not.toMatch(SECRET_KEY_RE);
    expect(JSON.stringify(client.scenario)).not.toMatch(SECRET_KEY_RE);
    expect(JSON.stringify(client.teachBack)).not.toMatch(SECRET_KEY_RE);
  });

  it('keeps the lesson-level reveal bridge table (caveman phrase -> technical term): it is rendered, not an answer key', () => {
    const client = toClientLesson(FIXTURE_LESSON);
    expect(client.explanation.reveal).toEqual([
      { caveman: 'bundle of changes', technical: 'transaction' },
      { caveman: 'bookmark', technical: 'savepoint' },
    ]);
    expect(findSecretKeys(client, '', [])).toEqual(['explanation.reveal']); // the exemption is exactly that path
  });

  it('keeps learner-facing fields on every projected exercise', () => {
    const client = toClientLesson(FIXTURE_LESSON);
    expect(client.exercises).toHaveLength(FIXTURE_LESSON.exercises.length);
    for (const exercise of client.exercises) {
      expect(exercise.id).toMatch(/^d001-fixture-lesson\//);
      expect(exercise.prompt).toBeDefined();
      expect(exercise.depth).toBeGreaterThanOrEqual(1);
      expect(exercise.dimension).toBeTruthy();
    }
    const mcq = client.exercises.find((exercise) => exercise.type === 'mcq');
    expect(mcq && 'options' in mcq && mcq.options).toEqual(['It is rolled back', 'It stays', 'It is retried']);
    const debug = client.exercises.find((exercise) => exercise.type === 'debug_code');
    expect(debug && 'fixOptions' in debug && debug.fixOptions).toHaveLength(2);
    expect(debug && 'code' in debug && debug.code.language).toBe('apex');
    expect(client.scenario.scenario).toBe('Invoices exist without lines after a nightly job.');
    expect(client.teachBack.audience).toBe('junior_dev');
  });

  it('does not mutate the source lesson', () => {
    const before = JSON.stringify(FIXTURE_LESSON);
    toClientLesson(FIXTURE_LESSON);
    expect(JSON.stringify(FIXTURE_LESSON)).toBe(before);
  });

  it('projects every exercise type the schema knows (fixtures cover the full union)', () => {
    const seen = new Set([...LESSONS.flatMap((lesson) => lessonExercises(lesson)), ...FIXTURE_TEMPLATES.map((template) => template.exercise)].map((exercise) => exercise.type));
    for (const type of EXERCISE_TYPES) expect(seen.has(type)).toBe(true);
    for (const exercise of FIXTURE_TEMPLATES.map((template) => template.exercise)) {
      expect(JSON.stringify(toClientExercise(exercise))).not.toContain(SENTINEL);
    }
  });
});

describe('findSecretKeys', () => {
  it('reports dotted paths for nested secret keys and nothing for clean objects', () => {
    expect(findSecretKeys({ a: { keyPoints: ['x'] }, list: [{ answer: 1 }] })).toEqual(['a.keyPoints', 'list[0].answer']);
    expect(findSecretKeys({ prompt: 'the answer is 42', options: ['answer'] })).toEqual([]);
    expect(findSecretKeys({ explanation: { reveal: [] }, exercises: [{ reveal: 'x' }] })).toEqual(['exercises[0].reveal']);
  });
});
