import { describe, expect, it } from 'vitest';
import { capstoneUnlocked } from './bosses.ts';
import { GAMIFICATION_CONFIG } from './config.ts';
import type { AttemptRow, LessonProgressRow, LessonRow, MasteryRow } from './context.ts';
import { dayCredit, dayIndex, deriveLongTermProgress, gapClosed, gapClosureEvents, lessonStatusAfterFlex } from './long-term.ts';
import { day13Events, makeAttempt, makeLesson, makeMastery, makeMission, makeProgress } from './testing.ts';
import { computeXpEvents, sumXp } from './xp.ts';

const config = GAMIFICATION_CONFIG;
const today = '2026-09-07';

function coreLessons(count: number): LessonRow[] {
  return Array.from({ length: count }, (_, i) => makeLesson({ slug: `d${String(i + 1).padStart(3, '0')}`, day: i + 1, missionSlug: `m${Math.floor(i / 6) + 1}`, concepts: [`c${i + 1}`] }));
}

describe('deriveLongTermProgress', () => {
  it('reproduces the worked example: day 61, 55 competent + 5 below, 9 of 30 bosses -> 28%', () => {
    const lessons = coreLessons(179);
    const progress: LessonProgressRow[] = lessons.slice(0, 60).map((l) => makeProgress({ lessonSlug: l.slug }));
    progress.push(makeProgress({ lessonSlug: 'd061', status: 'in_progress' }));
    const masteries: MasteryRow[] = lessons.slice(0, 60).map((l, i) => makeMastery({ conceptId: l.concepts[0], overall: i < 55 ? 80 : 70 }));
    const missions = Array.from({ length: 30 }, (_, i) => makeMission({ slug: `m${i + 1}`, ordinal: i + 1 }));
    const attempts: AttemptRow[] = Array.from({ length: 9 }, (_, i) =>
      makeAttempt({ kind: 'boss', questionType: 'boss', bossKind: 'mission', bossRef: `m${i + 1}`, conceptId: null, conceptIds: ['c'], llmEvaluation: { defeated: true }, localDate: '2026-08-01' }),
    );
    attempts.unshift(makeAttempt({ localDate: '2026-07-01' }));
    const lt = deriveLongTermProgress({ lessons, lessonProgress: progress, masteries, missions, attempts, todayLocal: '2026-07-31' }, config);
    expect(lt).toEqual({ pct: 28, dayIndex: 61, calendarDay: 31, lessonsCompleted: 60, lessonsCompetent: 55 });
  });

  it('adds capstone credit: 0.5 attempted, 1.0 passed', () => {
    const lessons = coreLessons(3);
    const base = { lessons, lessonProgress: [], masteries: [], missions: [makeMission({ slug: 'm1' })], todayLocal: today };
    const attempted = makeAttempt({ kind: 'capstone', questionType: 'capstone', bossKind: 'capstone', bossRef: 'capstone', conceptId: null, conceptIds: ['c'], llmEvaluation: { defeated: false } });
    expect(deriveLongTermProgress({ ...base, attempts: [attempted] }, config).pct).toBe(5);
    const passed = { ...attempted, llmEvaluation: { defeated: true } };
    expect(deriveLongTermProgress({ ...base, attempts: [passed] }, config).pct).toBe(10);
  });

  it('calendarDay is days since the first attempt + 1, or 1 before any attempt', () => {
    const base = { lessons: coreLessons(2), lessonProgress: [], masteries: [], missions: [], todayLocal: today };
    expect(deriveLongTermProgress({ ...base, attempts: [] }, config).calendarDay).toBe(1);
    expect(deriveLongTermProgress({ ...base, attempts: [makeAttempt({ localDate: '2026-09-07' })] }, config).calendarDay).toBe(1);
    expect(deriveLongTermProgress({ ...base, attempts: [makeAttempt({ localDate: '2026-09-01' }), makeAttempt({ localDate: '2026-09-05' })] }, config).calendarDay).toBe(7);
  });
});

describe('dayCredit', () => {
  it('is 1 at Competent+, 0.5 completed below Competent, 0 otherwise including skipped_with_gap', () => {
    expect(dayCredit('completed', 75, config)).toBe(1);
    expect(dayCredit('completed_early', 90, config)).toBe(1);
    expect(dayCredit('completed', 74.9, config)).toBe(0.5);
    expect(dayCredit('completed_early', 0, config)).toBe(0.5);
    expect(dayCredit('skipped_with_gap', 100, config)).toBe(0);
    expect(dayCredit('in_progress', 100, config)).toBe(0);
    expect(dayCredit(undefined, 100, config)).toBe(0);
  });
});

describe('dayIndex', () => {
  const lessons = coreLessons(5);

  it('is the smallest core day not completed, completed_early or skipped_with_gap', () => {
    expect(dayIndex(lessons, [], config)).toBe(1);
    expect(dayIndex(lessons, [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd002', status: 'in_progress' })], config)).toBe(2);
  });

  it('skips skipped_with_gap days and closed gaps alike', () => {
    const progress = [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd002', status: 'skipped_with_gap' }), makeProgress({ lessonSlug: 'd003', status: 'completed_early' })];
    expect(dayIndex(lessons, progress, config)).toBe(4);
  });

  it('ignores side quests sharing a day and lessons without a day', () => {
    const withSide = [...lessons, makeLesson({ slug: 'sq', day: 1, kind: 'side_quest', visibility: 'side' }), makeLesson({ slug: 'w', day: null })];
    expect(dayIndex(withSide, lessons.map((l) => makeProgress({ lessonSlug: l.slug })), config)).toBe(6);
  });

  it('is 180 once all 179 core days are done', () => {
    const all = coreLessons(179);
    expect(dayIndex(all, all.map((l) => makeProgress({ lessonSlug: l.slug })), config)).toBe(180);
  });
});

describe('lessonStatusAfterFlex', () => {
  it('next_mission with the early-advance condition true yields completed_early; false yields skipped_with_gap', () => {
    expect(lessonStatusAfterFlex('in_progress', 'next_mission', true)).toBe('completed_early');
    expect(lessonStatusAfterFlex('in_progress', 'next_mission', false)).toBe('skipped_with_gap');
  });

  it('terminal statuses never change and other actions keep the status', () => {
    expect(lessonStatusAfterFlex('completed', 'next_mission', false)).toBe('completed');
    expect(lessonStatusAfterFlex('completed_early', 'next_mission', false)).toBe('completed_early');
    expect(lessonStatusAfterFlex('in_progress', 'continue', true)).toBe('in_progress');
    expect(lessonStatusAfterFlex('not_started', 'challenge_me', true)).toBe('not_started');
  });

  it('completed_early earns the same lesson_completed XP as completed', () => {
    const early = computeXpEvents({
      attempt: { kind: 'teach_back', questionType: 'teach_back', conceptId: 'c', exerciseId: 'e', formKey: 'e', depth: 5, correct: true, passed: true, lessonSlug: 'd012', reviewItemId: null, bossKind: null, bossRef: null },
      evaluation: { correctness: 90, understanding: 90 },
      masteryBefore: null,
      masteryAfter: null,
      lessonCompleted: lessonStatusAfterFlex('in_progress', 'next_mission', true) !== 'skipped_with_gap',
      priorAttemptsOnQuestion: 0,
      isIdenticalFormReplay: false,
      isReview: false,
      reviewCorrect: false,
      labPassed: false,
      config,
    });
    expect(early.find((e) => e.reason === 'lesson_completed')).toEqual({ reason: 'lesson_completed', ref: 'd012', base: 50, multiplier: 1, amount: 50 });
  });
});

describe('gap closure', () => {
  const concepts = ['c1', 'c2'];

  it('closes when every concept of the lesson reaches Developing', () => {
    expect(gapClosed(concepts, [makeMastery({ conceptId: 'c1', overall: 60 }), makeMastery({ conceptId: 'c2', overall: 60 })])).toBe(true);
    expect(gapClosed(concepts, [makeMastery({ conceptId: 'c1', overall: 60 }), makeMastery({ conceptId: 'c2', overall: 59 })])).toBe(false);
    expect(gapClosed(concepts, [makeMastery({ conceptId: 'c1', overall: 90 })])).toBe(false);
    expect(gapClosed([], [])).toBe(false);
  });

  it('emits lesson_completed exactly once and flips the status to completed', () => {
    const masteries = [makeMastery({ conceptId: 'c1', overall: 70 }), makeMastery({ conceptId: 'c2', overall: 65 })];
    const first = gapClosureEvents({ lessonSlug: 'd010', status: 'skipped_with_gap', conceptSlugs: concepts, masteries, ledger: [] }, config);
    expect(first).toEqual({ status: 'completed', events: [{ reason: 'lesson_completed', ref: 'd010', base: 50, multiplier: 1, amount: 50 }] });
    const again = gapClosureEvents({ lessonSlug: 'd010', status: 'skipped_with_gap', conceptSlugs: concepts, masteries, ledger: first.events }, config);
    expect(again).toEqual({ status: 'completed', events: [] });
    const notYet = gapClosureEvents({ lessonSlug: 'd010', status: 'skipped_with_gap', conceptSlugs: concepts, masteries: [masteries[0]], ledger: [] }, config);
    expect(notYet).toEqual({ status: 'skipped_with_gap', events: [] });
    const done = gapClosureEvents({ lessonSlug: 'd010', status: 'completed', conceptSlugs: concepts, masteries, ledger: [] }, config);
    expect(done).toEqual({ status: 'completed', events: [] });
  });

  it('a closed gap is indistinguishable from completed for credit and the boss unlock', () => {
    const lessons = [makeLesson({ slug: 'd001', day: 1, missionSlug: 'm1' })];
    const closed = [makeProgress({ lessonSlug: 'd001', status: 'completed' })];
    expect(dayCredit(closed[0].status, 80, config)).toBe(1);
    expect(capstoneUnlocked({ missions: [makeMission({ slug: 'm1' })], lessons, lessonProgress: closed, attempts: [] }, config)).toBe(true);
  });
});

describe('capstone unlock paths', () => {
  const lessons = [makeLesson({ slug: 'd001', day: 1, missionSlug: 'm1' }), makeLesson({ slug: 'd002', day: 2, missionSlug: 'm2' })];
  const missions = [makeMission({ slug: 'm1' }), makeMission({ slug: 'm2', ordinal: 2 })];
  const defeated = (ref: string) =>
    makeAttempt({ kind: 'boss', questionType: 'boss', bossKind: 'mission', bossRef: ref, conceptId: null, conceptIds: ['c'], llmEvaluation: { defeated: true } });

  it('via every mission boss defeated', () => {
    expect(capstoneUnlocked({ missions, lessons, lessonProgress: [], attempts: [defeated('m1'), defeated('m2')] }, config)).toBe(true);
  });

  it('via every core lesson with day <= 179 completed', () => {
    const progress = lessons.map((l) => makeProgress({ lessonSlug: l.slug, status: 'completed_early' }));
    expect(capstoneUnlocked({ missions, lessons, lessonProgress: progress, attempts: [] }, config)).toBe(true);
    expect(capstoneUnlocked({ missions, lessons, lessonProgress: [progress[0]], attempts: [defeated('m1')] }, config)).toBe(false);
  });
});

describe('Day 13 fixture', () => {
  it('sums to 401 XP', () => {
    expect(sumXp(day13Events(config))).toBe(401);
  });
});
