import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BossRubric, CapstoneRubric } from '../llm/schemas.ts';
import {
  bossOverall,
  bossStatus,
  bossXpEvents,
  capstoneOverall,
  capstoneUnlocked,
  conceptsFirstAttemptedInWeek,
  deriveBossBoard,
  isDefeated,
  lastRubricSummary,
  missionBossUnlocked,
  pickDashboardBoss,
  selectWeeklyTemplate,
  weakestDimension,
  weekIndexFor,
  weeklyBossRef,
  weeklyBossWindow,
} from './bosses.ts';
import { GAMIFICATION_CONFIG } from './config.ts';
import { makeAttempt, makeBossRubric, makeCapstoneRubric, makeLesson, makeMission, makeProgress, makeWeeklyTemplate } from './testing.ts';
import type { BossKind } from './types.ts';

const config = GAMIFICATION_CONFIG;
const today = '2026-09-07';

interface Fixture {
  id: string;
  bossKind: BossKind;
  bossRef: string;
  rubric: BossRubric | CapstoneRubric;
  defeated: boolean;
}
const fixtures = (JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'rubrics.json'), 'utf8')) as { fixtures: Fixture[] }).fixtures;

describe('isDefeated', () => {
  it('mission: overall >= 70 and every dimension >= 40', () => {
    expect(isDefeated(makeBossRubric({ suspect: 40, why: 40, dataNeeded: 100, whatToInspect: 100, solution: 100, tradeOffs: 40 }), 'mission', config)).toBe(true); // mean 70
    expect(isDefeated(makeBossRubric({ suspect: 39, why: 41, dataNeeded: 100, whatToInspect: 100, solution: 100, tradeOffs: 40 }), 'mission', config)).toBe(false);
    expect(isDefeated(makeBossRubric({ suspect: 69, why: 69, dataNeeded: 69, whatToInspect: 69, solution: 69, tradeOffs: 69 }), 'mission', config)).toBe(false);
  });

  it('weekly: overall >= 75 and every dimension >= 50', () => {
    expect(isDefeated(makeBossRubric({ suspect: 75, why: 75, dataNeeded: 75, whatToInspect: 75, solution: 75, tradeOffs: 75 }), 'weekly', config)).toBe(true);
    expect(isDefeated(makeBossRubric({ suspect: 100, why: 100, dataNeeded: 100, whatToInspect: 100, solution: 100, tradeOffs: 49 }), 'weekly', config)).toBe(false);
    expect(isDefeated(makeBossRubric({ suspect: 74, why: 74, dataNeeded: 74, whatToInspect: 74, solution: 74, tradeOffs: 74 }), 'weekly', config)).toBe(false);
  });

  it('capstone: overall >= 75 and at least 9 of 12 dimensions >= 60', () => {
    expect(isDefeated(makeCapstoneRubric(), 'capstone', config)).toBe(true);
    const threeLow = makeCapstoneRubric({ observability: 59, reliability: 10, communication: 10 }, 0); // 9 x 80 + 79 = 799 / 12 = 66.6 -> fails on overall
    expect(isDefeated(threeLow, 'capstone', config)).toBe(false);
    const nineOf12 = makeCapstoneRubric({ observability: 59, reliability: 59, communication: 59 }); // mean 74.75 -> 75
    expect(isDefeated(nineOf12, 'capstone', config)).toBe(true);
    // 8 dims >= 60 with overall 80: fails on the dimension count alone
    const eightOf12 = makeCapstoneRubric({ observability: 59, reliability: 59, communication: 59, security: 59, platformKnowledge: 100, dataArchitecture: 100, apex: 100, automation: 100 });
    expect(capstoneOverall(eightOf12)).toBe(80);
    expect(isDefeated(eightOf12, 'capstone', config)).toBe(false);
  });

  it('recomputes overall from the dimensions and ignores the stored/model value', () => {
    const inflated = makeBossRubric({ suspect: 60, why: 60, dataNeeded: 60, whatToInspect: 60, solution: 60, tradeOffs: 60 });
    inflated.overall = 100;
    expect(bossOverall(inflated)).toBe(60);
    expect(isDefeated(inflated, 'mission', config)).toBe(false);
    const cap = makeCapstoneRubric({}, 0);
    expect(capstoneOverall(cap)).toBe(80);
    expect(isDefeated(cap, 'capstone', config)).toBe(true);
  });

  it('agrees with the stored (llm_evaluation->>defeated) value for every shared fixture', () => {
    expect(fixtures.map((f) => f.id)).toEqual(['mission', 'weekly', 'capstone']);
    for (const f of fixtures) {
      expect(isDefeated(f.rubric, f.bossKind, config), f.id).toBe(f.defeated);
    }
    // The same mission rubric would not pass the weekly bar, and a weekly rubric can fail on one dimension alone.
    expect(isDefeated(fixtures[0].rubric, 'weekly', config)).toBe(false);
  });

  it('weakestDimension names the lowest rubric key', () => {
    expect(weakestDimension(fixtures[0].rubric)).toBe('tradeOffs');
    expect(weakestDimension(fixtures[2].rubric)).toBe('observability');
  });
});

describe('bossXpEvents', () => {
  it('emits attempted always and defeated only on a true verdict, flat', () => {
    expect(bossXpEvents({ kind: 'mission', ref: 'w1-m1', defeated: false }, config)).toEqual([
      { reason: 'mission_boss_attempted', ref: 'w1-m1', base: 20, multiplier: 1, amount: 20 },
    ]);
    expect(bossXpEvents({ kind: 'weekly', ref: 'weekly-w04', defeated: true }, config).map((e) => [e.reason, e.amount])).toEqual([
      ['weekly_boss_attempted', 30],
      ['weekly_boss_defeated', 250],
    ]);
    expect(bossXpEvents({ kind: 'capstone', ref: 'capstone', defeated: true }, config).map((e) => [e.reason, e.amount])).toEqual([
      ['capstone_attempted', 300],
      ['capstone_passed', 1000],
    ]);
  });
});

describe('bossStatus and cooldown', () => {
  const attempt = (localDate: string, defeated = false, ref = 'w1-m1') =>
    makeAttempt({ kind: 'boss', questionType: 'boss', bossKind: 'mission', bossRef: ref, conceptId: null, conceptIds: ['c'], localDate, llmEvaluation: { ...makeBossRubric(), defeated } });

  it('locked while the unlock condition is false, carrying the unlock date when known', () => {
    expect(bossStatus({ attempts: [], unlocked: false, todayLocal: today }, config)).toEqual({ status: 'locked', availableAt: null });
    expect(bossStatus({ attempts: [], unlocked: false, todayLocal: today, availableOn: '2026-09-10' }, config)).toEqual({ status: 'locked', availableAt: '2026-09-10' });
  });

  it('available when unlocked with no attempt today; cooldown until the next local date after a failed attempt', () => {
    expect(bossStatus({ attempts: [], unlocked: true, todayLocal: today }, config)).toEqual({ status: 'available', availableAt: null });
    expect(bossStatus({ attempts: [attempt('2026-09-07')], unlocked: true, todayLocal: today }, config)).toEqual({ status: 'cooldown', availableAt: '2026-09-08' });
    expect(bossStatus({ attempts: [attempt('2026-09-06')], unlocked: true, todayLocal: today }, config)).toEqual({ status: 'available', availableAt: null });
  });

  it('defeated wins over cooldown, lock and expiry, and never reverts', () => {
    expect(bossStatus({ attempts: [attempt('2026-09-07', true)], unlocked: true, todayLocal: today }, config)).toEqual({ status: 'defeated', availableAt: null });
    expect(bossStatus({ attempts: [attempt('2026-09-01', true), attempt('2026-09-07')], unlocked: false, todayLocal: today, newerOutstanding: 5 }, config).status).toBe('defeated');
  });

  it('weekly expiry: superseded by two newer weekly bosses', () => {
    expect(bossStatus({ attempts: [], unlocked: true, todayLocal: today, newerOutstanding: 1 }, config).status).toBe('available');
    expect(bossStatus({ attempts: [], unlocked: true, todayLocal: today, newerOutstanding: 2 }, config).status).toBe('expired');
    expect(bossStatus({ attempts: [attempt('2026-09-07')], unlocked: true, todayLocal: today, newerOutstanding: 2 }, config).status).toBe('expired');
  });

  it('lastRubricSummary reads the latest attempt', () => {
    const first = makeAttempt({ kind: 'boss', questionType: 'boss', bossKind: 'mission', bossRef: 'w1-m1', conceptId: null, conceptIds: ['c'], localDate: '2026-09-01', llmEvaluation: { ...makeBossRubric({ tradeOffs: 10 }), defeated: false } });
    const second = makeAttempt({ kind: 'boss', questionType: 'boss', bossKind: 'mission', bossRef: 'w1-m1', conceptId: null, conceptIds: ['c'], localDate: '2026-09-02', llmEvaluation: { ...makeBossRubric({ why: 50 }), defeated: false } });
    expect(lastRubricSummary([first, second])).toEqual({ overall: 75, weakest: 'why' });
    expect(lastRubricSummary([])).toBeNull();
  });
});

describe('weekly window', () => {
  const first = '2026-08-01';

  it('week W spans [first + 7(W-1), first + 7W) and unlocks on first + 7W', () => {
    expect(weeklyBossWindow(first, 1, config)).toEqual({ week: 1, ref: 'weekly-w01', startsOn: '2026-08-01', endsOn: '2026-08-07', availableOn: '2026-08-08' });
    expect(weeklyBossWindow(first, 2, config)).toEqual({ week: 2, ref: 'weekly-w02', startsOn: '2026-08-08', endsOn: '2026-08-14', availableOn: '2026-08-15' });
    expect(weeklyBossRef(12)).toBe('weekly-w12');
  });

  it('weekIndexFor maps a local date onto its week', () => {
    expect(weekIndexFor('2026-08-01', first, config)).toBe(1);
    expect(weekIndexFor('2026-08-07', first, config)).toBe(1);
    expect(weekIndexFor('2026-08-08', first, config)).toBe(2);
    expect(weekIndexFor('2026-09-07', first, config)).toBe(6);
  });

  it('conceptsFirstAttemptedInWeek counts a concept in the week of its first attempt only', () => {
    const attempts = [
      makeAttempt({ conceptId: 'a', localDate: '2026-08-02' }),
      makeAttempt({ conceptId: 'a', localDate: '2026-08-09' }),
      makeAttempt({ conceptId: 'b', localDate: '2026-08-09' }),
      makeAttempt({ conceptId: null, conceptIds: ['c', 'd'], kind: 'boss', questionType: 'boss', bossKind: 'mission', bossRef: 'm', localDate: '2026-08-10' }),
    ];
    expect(conceptsFirstAttemptedInWeek(attempts, first, 1, config)).toEqual(['a']);
    expect(conceptsFirstAttemptedInWeek(attempts, first, 2, config).sort()).toEqual(['b', 'c', 'd']);
    expect(conceptsFirstAttemptedInWeek(attempts, first, 3, config)).toEqual([]);
  });

  it('selectWeeklyTemplate picks the largest concept overlap, first template on ties, null without overlap', () => {
    const templates = [
      makeWeeklyTemplate({ id: 't-limits', concepts: ['a', 'b'] }),
      makeWeeklyTemplate({ id: 't-skew', concepts: ['b', 'c', 'd'] }),
      makeWeeklyTemplate({ id: 't-tie', concepts: ['c', 'd', 'e'] }),
    ];
    expect(selectWeeklyTemplate(templates, ['b', 'c', 'd'])?.id).toBe('t-skew');
    expect(selectWeeklyTemplate(templates, ['c', 'd'])?.id).toBe('t-skew');
    expect(selectWeeklyTemplate(templates, ['a'])?.id).toBe('t-limits');
    expect(selectWeeklyTemplate(templates, ['zz'])).toBeNull();
    expect(selectWeeklyTemplate([], ['a'])).toBeNull();
  });
});

describe('unlock rules', () => {
  const lessons = [
    makeLesson({ slug: 'd001', day: 1, missionSlug: 'm1' }),
    makeLesson({ slug: 'd002', day: 2, missionSlug: 'm1', kind: 'lab' }),
    makeLesson({ slug: 'sq-1', day: 2, missionSlug: 'm1', kind: 'side_quest', visibility: 'side' }),
    makeLesson({ slug: 'boss-m1', day: 3, missionSlug: 'm1', kind: 'boss' }),
    makeLesson({ slug: 'hidden-1', day: 3, missionSlug: 'm1', visibility: 'hidden' }),
  ];

  it('mission boss unlocks when every core non-boss lesson is completed or completed_early, ignoring side quests and hidden challenges', () => {
    expect(missionBossUnlocked('m1', lessons, [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd002', status: 'completed_early' })])).toBe(true);
    expect(missionBossUnlocked('m1', lessons, [makeProgress({ lessonSlug: 'd001' })])).toBe(false);
    expect(missionBossUnlocked('m1', lessons, [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd002', status: 'skipped_with_gap' })])).toBe(false);
    expect(missionBossUnlocked('m1', lessons, [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd002', status: 'in_progress' })])).toBe(false);
  });

  it('a closed gap (status back to completed) counts like any completion', () => {
    const progress = [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd002', status: 'completed' })];
    expect(missionBossUnlocked('m1', lessons, progress)).toBe(true);
  });

  it('a mission with no core lessons is never unlocked', () => {
    expect(missionBossUnlocked('empty', lessons, [])).toBe(false);
  });

  it('capstone unlocks via every mission boss defeated', () => {
    const missions = [makeMission({ slug: 'm1' }), makeMission({ slug: 'm2', ordinal: 2 })];
    const defeated = (ref: string) =>
      makeAttempt({ kind: 'boss', questionType: 'boss', bossKind: 'mission', bossRef: ref, conceptId: null, conceptIds: ['c'], llmEvaluation: { defeated: true } });
    expect(capstoneUnlocked({ missions, lessons, lessonProgress: [], attempts: [defeated('m1'), defeated('m2')] }, config)).toBe(true);
    expect(capstoneUnlocked({ missions, lessons, lessonProgress: [], attempts: [defeated('m1')] }, config)).toBe(false);
    expect(capstoneUnlocked({ missions: [], lessons, lessonProgress: [], attempts: [] }, config)).toBe(false);
  });

  it('capstone unlocks via every core lesson with day <= 179 completed', () => {
    const missions = [makeMission({ slug: 'm1' })];
    const core = lessons.filter((l) => l.visibility === 'core');
    const done = core.map((l) => makeProgress({ lessonSlug: l.slug }));
    expect(capstoneUnlocked({ missions, lessons, lessonProgress: done, attempts: [] }, config)).toBe(true);
    const withCapstone = [...lessons, makeLesson({ slug: 'capstone', day: 180, kind: 'capstone', missionSlug: 'm1' })];
    expect(capstoneUnlocked({ missions, lessons: withCapstone, lessonProgress: done, attempts: [] }, config)).toBe(true);
    expect(capstoneUnlocked({ missions, lessons, lessonProgress: done.slice(1), attempts: [] }, config)).toBe(false);
    expect(capstoneUnlocked({ missions, lessons: [], lessonProgress: [], attempts: [] }, config)).toBe(false);
  });
});

describe('deriveBossBoard / pickDashboardBoss', () => {
  const missions = [makeMission({ slug: 'm1', title: 'Basics', bossLessonSlug: 'boss-m1' }), makeMission({ slug: 'm2', title: 'Limits', ordinal: 2 })];
  const lessons = [
    makeLesson({ slug: 'd001', day: 1, missionSlug: 'm1', concepts: ['a'] }),
    makeLesson({ slug: 'boss-m1', day: 2, missionSlug: 'm1', kind: 'boss', title: 'Boss: the slow trigger' }),
    makeLesson({ slug: 'd003', day: 3, missionSlug: 'm2', concepts: ['b'] }),
    makeLesson({ slug: 'boss-m2', day: 4, missionSlug: 'm2', kind: 'boss' }),
  ];
  const templates = [makeWeeklyTemplate({ id: 'weekly-w1-limits', title: 'Limits week', concepts: ['a', 'b', 'c'] })];

  it('lists mission bosses in order, weekly instances from the first attempt, and the capstone', () => {
    const attempts = [
      makeAttempt({ conceptId: 'a', localDate: '2026-08-20' }),
      makeAttempt({ conceptId: 'b', localDate: '2026-08-21' }),
      makeAttempt({ conceptId: 'c', localDate: '2026-08-22' }),
      makeAttempt({ conceptId: 'd', localDate: '2026-08-29' }),
    ];
    const board = deriveBossBoard({ attempts, lessons, missions, lessonProgress: [makeProgress({ lessonSlug: 'd001' })], weeklyTemplates: templates, todayLocal: '2026-09-07' }, config);
    expect(board.map((b) => [b.kind, b.ref, b.status])).toEqual([
      ['mission', 'm1', 'available'],
      ['mission', 'm2', 'locked'],
      ['weekly', 'weekly-w01', 'available'],
      ['capstone', 'capstone', 'locked'],
    ]);
    expect(board[0].title).toBe('Boss: the slow trigger');
    expect(board[2].title).toBe('Limits week');
    // week 2 (Aug 27 - Sep 2) saw only one new concept: skipped; week 3 is still in progress.
    expect(board.find((b) => b.ref === 'weekly-w02')).toBeUndefined();
  });

  it('expires an old undefeated weekly once two newer ones exist', () => {
    const attempts = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-15', '2026-07-16', '2026-07-17'].map((localDate, i) =>
      makeAttempt({ conceptId: `c${i}`, localDate }),
    );
    const board = deriveBossBoard({ attempts, lessons, missions, lessonProgress: [], weeklyTemplates: templates, todayLocal: '2026-07-25' }, config);
    const weekly = board.filter((b) => b.kind === 'weekly').map((b) => [b.ref, b.status]);
    expect(weekly).toEqual([
      ['weekly-w01', 'expired'],
      ['weekly-w02', 'available'],
      ['weekly-w03', 'available'],
    ]);
  });

  it('pickDashboardBoss prefers an available boss (capstone, mission, newest weekly), then cooldown, then the current mission boss', () => {
    const board = deriveBossBoard({ attempts: [], lessons, missions, lessonProgress: [], weeklyTemplates: templates, todayLocal: today }, config);
    expect(pickDashboardBoss(board, 'm2')?.ref).toBe('m2');
    expect(pickDashboardBoss(board, null)?.ref).toBe('m1');
    const unlocked = deriveBossBoard({ attempts: [], lessons, missions, lessonProgress: [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd003' })], weeklyTemplates: templates, todayLocal: today }, config);
    expect(pickDashboardBoss(unlocked, 'm2')?.ref).toBe('m1');
    expect(pickDashboardBoss([], null)).toBeNull();
  });
});
