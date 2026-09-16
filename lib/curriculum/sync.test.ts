import { describe, expect, it } from 'vitest';
import { FIXTURE_LESSON, FIXTURE_REGISTRY, cloneFixtureRegistry } from '../../tests/fixtures/lesson-fixture.ts';
import { SKILL_IDS } from '../gamification/types.ts';
import { SYNC_TABLE_ORDER, SyncValidationError, buildSyncPlan, contentHash, planCounts, primarySkill, releaseMismatches, retirementIds } from './sync.ts';

describe('contentHash', () => {
  it('is a sha256 hex digest, stable across calls and structurally equal copies', () => {
    const hash = contentHash(FIXTURE_LESSON);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash(FIXTURE_LESSON)).toBe(hash);
    expect(contentHash(structuredClone(FIXTURE_LESSON))).toBe(hash);
    expect(contentHash(JSON.parse(JSON.stringify(FIXTURE_LESSON)))).toBe(hash);
  });

  it('changes for any content change', () => {
    expect(contentHash({ ...FIXTURE_LESSON, title: 'Renamed' })).not.toBe(contentHash(FIXTURE_LESSON));
    const exercises = [...FIXTURE_LESSON.exercises];
    exercises[0] = { ...exercises[0], prompt: 'Reworded' };
    expect(contentHash({ ...FIXTURE_LESSON, exercises })).not.toBe(contentHash(FIXTURE_LESSON));
  });
});

describe('primarySkill', () => {
  it('picks the heaviest entry, ties in SKILL_IDS order, fallback when absent', () => {
    expect(primarySkill({ platform: 0.6, apex: 0.4 }, 'data')).toBe('platform');
    expect(primarySkill({ apex: 0.7, platform: 0.3 }, 'data')).toBe('apex');
    expect(primarySkill({ apex: 0.5, data: 0.5 }, 'platform')).toBe('data'); // data precedes apex in SKILL_IDS
    expect(primarySkill(undefined, 'integration')).toBe('integration');
    expect(primarySkill({}, 'integration')).toBe('integration');
  });
});

describe('buildSyncPlan', () => {
  const plan = buildSyncPlan(FIXTURE_REGISTRY);

  it('derives rows for every registry table in upsert order', () => {
    expect(SYNC_TABLE_ORDER).toEqual(['worlds', 'missions', 'skills', 'concepts', 'lessons', 'lesson_concepts', 'concept_skills']);
    expect(Object.keys(plan)).toEqual(['worlds', 'missions', 'skills', 'concepts', 'lessons', 'lessonConcepts', 'conceptSkills']);
    expect(planCounts(plan)).toEqual({ worlds: 1, missions: 1, skills: 6, concepts: 3, lessons: 3, lesson_concepts: 4, concept_skills: 4 });
  });

  it('worlds and missions carry the DDL columns; the mission boss is its last core non-capstone lesson', () => {
    expect(plan.worlds).toEqual([{ id: 'w1-fixture', ordinal: 1, title: 'Fixture World', skill: 'platform', retired_at: null }]);
    expect(plan.missions).toEqual([{ id: 'w1-m1-fixture', world_id: 'w1-fixture', ordinal: 1, title: 'Fixture Mission', boss_lesson_id: 'boss-w1-m1-fixture', retired_at: null }]);
  });

  it('seeds the six skills in SKILL_IDS order with labels', () => {
    expect(plan.skills.map((row) => row.id)).toEqual([...SKILL_IDS]);
    expect(plan.skills[0]).toEqual({ id: 'platform', ordinal: 1, label: 'Platform Knowledge' });
    expect(plan.skills[3]).toEqual({ id: 'apex', ordinal: 4, label: 'Apex & Automation' });
  });

  it('orders concepts parents-first and fills the primary skill', () => {
    expect(plan.concepts.map((row) => row.id)).toEqual(['fixture', 'fixture.boundaries', 'fixture.savepoints']);
    expect(plan.concepts[0]).toEqual({ id: 'fixture', parent_id: null, world_id: 'w1-fixture', title: 'Fixture parent', skill: 'platform', retired_at: null });
    expect(plan.concepts[2]).toMatchObject({ parent_id: 'fixture', skill: 'platform' });
  });

  it('lesson rows carry release, api_version and the content hash, ordered by day', () => {
    expect(plan.lessons.map((row) => row.id)).toEqual(['d001-fixture-lesson', 'boss-w1-m1-fixture', 'capstone']);
    expect(plan.lessons[0]).toEqual({
      id: 'd001-fixture-lesson',
      mission_id: 'w1-m1-fixture',
      day: 1,
      kind: 'lesson',
      visibility: 'core',
      ordinal: 1,
      title: 'Bundles and bookmarks',
      release: 'summer-26',
      api_version: '67.0',
      content_hash: contentHash(FIXTURE_LESSON),
      retired_at: null,
    });
  });

  it('lesson_concepts marks the first concept primary and dedupes', () => {
    expect(plan.lessonConcepts.filter((row) => row.lesson_id === 'd001-fixture-lesson')).toEqual([
      { lesson_id: 'd001-fixture-lesson', concept_id: 'fixture.boundaries', is_primary: true },
      { lesson_id: 'd001-fixture-lesson', concept_id: 'fixture.savepoints', is_primary: false },
    ]);
  });

  it('concept_skills has one row per weight entry, defaulting to the world skill, rounded to numeric(3,2)', () => {
    expect(plan.conceptSkills).toEqual([
      { concept_id: 'fixture', skill_id: 'platform', weight: 1 },
      { concept_id: 'fixture.boundaries', skill_id: 'platform', weight: 1 },
      { concept_id: 'fixture.savepoints', skill_id: 'platform', weight: 0.6 },
      { concept_id: 'fixture.savepoints', skill_id: 'apex', weight: 0.4 },
    ]);
  });

  it('is idempotent: two builds of the same registry are deep-equal', () => {
    expect(buildSyncPlan(FIXTURE_REGISTRY)).toEqual(plan);
  });

  it('refuses a lesson whose (release, apiVersion) is not in RELEASES', () => {
    const registry = cloneFixtureRegistry();
    registry.LESSONS = [{ ...FIXTURE_LESSON, verification: { ...FIXTURE_LESSON.verification, apiVersion: '68.0' } }];
    expect(releaseMismatches(registry)).toEqual(["lesson d001-fixture-lesson: verification.apiVersion '68.0' differs from release summer-26 (67.0)"]);
    expect(() => buildSyncPlan(registry)).toThrow(SyncValidationError);
    registry.LESSONS = [{ ...FIXTURE_LESSON, verification: { ...FIXTURE_LESSON.verification, release: 'winter-27', apiVersion: '68.0' } }];
    expect(() => buildSyncPlan(registry)).toThrow(/verification.release 'winter-27' is not in RELEASES/);
  });

  it('refuses unresolvable parents, worlds, missions and concepts', () => {
    const registry = cloneFixtureRegistry();
    registry.CONCEPTS = [...registry.CONCEPTS, { ...registry.CONCEPTS[1], slug: 'orphan.leaf', parent: 'orphan' }];
    expect(() => buildSyncPlan(registry)).toThrow(/concept orphan.leaf: parent 'orphan' is not in CONCEPTS/);
  });
});

describe('retirementIds', () => {
  it('retires live rows absent from data and revives retired rows that came back; never touches the rest', () => {
    const existing = [
      { id: 'a', retired_at: null },
      { id: 'b', retired_at: null },
      { id: 'c', retired_at: '2026-01-01T00:00:00Z' },
      { id: 'd', retired_at: '2026-01-01T00:00:00Z' },
    ];
    expect(retirementIds(existing, ['a', 'c'])).toEqual({ retire: ['b'], revive: ['c'] });
    expect(retirementIds([], ['a'])).toEqual({ retire: [], revive: [] });
    expect(retirementIds(existing, ['a', 'b'])).toEqual({ retire: [], revive: [] });
  });
});
