import { describe, expect, it } from 'vitest';
import { GAMIFICATION_CONFIG } from './config.ts';
import { isoWeekOf, localHourOf } from './dates.ts';
import { buildDashboardViewModel, buildProgressViewModel, toAchievementContext } from './index.ts';
import { makeAttempt, makeBossRubric, makeConcept, makeContext, makeLesson, makeMastery, makeMission, makeProgress, makeReviewItem, makeWorld, makeXp } from './testing.ts';

const config = GAMIFICATION_CONFIG;
const now = '2026-09-07T20:15:00.000Z';

function richContext() {
  return makeContext({
    profile: { displayName: 'Dana', timeZone: 'Europe/Lisbon' },
    todayLocal: '2026-09-07',
    registry: {
      worlds: [makeWorld({ slug: 'w1-platform' }), makeWorld({ slug: 'w2-data', ordinal: 2, title: 'Data', skill: 'data' })],
      missions: [makeMission({ slug: 'w1-m1', worldSlug: 'w1-platform', bossLessonSlug: 'boss-w1-m1' }), makeMission({ slug: 'w2-m1', worldSlug: 'w2-data' })],
      lessons: [
        makeLesson({ slug: 'd001', day: 1, missionSlug: 'w1-m1', concepts: ['tx'] }),
        makeLesson({ slug: 'd002', day: 2, missionSlug: 'w1-m1', concepts: ['tx.savepoints'], title: 'Savepoints' }),
        makeLesson({ slug: 'boss-w1-m1', day: 3, missionSlug: 'w1-m1', kind: 'boss', title: 'Boss: rollback storm' }),
        makeLesson({ slug: 'd004', day: 4, missionSlug: 'w2-m1', concepts: ['soql.ldv'] }),
      ],
      concepts: [
        makeConcept({ slug: 'tx', title: 'Transactions' }),
        makeConcept({ slug: 'tx.savepoints', parentSlug: 'tx', title: 'Savepoints' }),
        makeConcept({ slug: 'soql.ldv', worldSlug: 'w2-data', title: 'LDV', skills: { data: 1 } }),
      ],
      weeklyTemplates: [],
    },
    attempts: [
      makeAttempt({ conceptId: 'tx', lessonSlug: 'd001', localDate: '2026-09-01' }),
      makeAttempt({ conceptId: 'tx', lessonSlug: 'd001', localDate: '2026-09-01', misconceptionIds: ['all-or-nothing'] }),
      makeAttempt({ conceptId: 'tx', lessonSlug: 'd001', localDate: '2026-09-02', misconceptionIds: ['all-or-nothing'], correct: false, passed: false }),
      makeAttempt({ conceptId: 'tx.savepoints', lessonSlug: 'd002', localDate: '2026-09-07', kind: 'teach_back', questionType: 'teach_back', llmEvaluation: { correctness: 80, understanding: 75 } }),
    ],
    xpTransactions: [
      makeXp({ localDate: '2026-09-01', reason: 'answer_correct', amount: 10 }),
      makeXp({ localDate: '2026-09-01', reason: 'lesson_completed', ref: 'd001', base: 50 }),
      makeXp({ localDate: '2026-09-01', reason: 'achievement_unlocked', ref: 'first_light', base: 25 }),
      makeXp({ localDate: '2026-09-07', reason: 'teach_back_passed', base: 40, amount: 60, multiplier: 1.5 }),
      makeXp({ localDate: '2026-09-07', reason: 'band_reached', ref: 'tx.savepoints:developing', base: 20 }),
    ],
    qualifyingDays: ['2026-09-01', '2026-09-07'],
    masteries: [makeMastery({ conceptId: 'tx', overall: 50 }), makeMastery({ conceptId: 'tx.savepoints', overall: 65 })],
    reviewItems: [makeReviewItem({ conceptId: 'tx', dueOn: '2026-09-06' }), makeReviewItem({ conceptId: 'tx.savepoints', dueOn: '2026-08-20' })],
    lessonProgress: [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd002', status: 'in_progress', completedAt: null })],
    currentLesson: { lessonSlug: 'd002', progressPct: 40, nextStep: 'deep_dive', actions: ['continue', 'challenge_me'] },
    lastDashboardViewedAt: '2026-08-31T00:00:00.000Z',
  });
}

describe('buildDashboardViewModel', () => {
  it('assembles every card from the context without touching a clock', () => {
    const vm = buildDashboardViewModel(richContext(), now, config);
    expect(vm.generatedAt).toBe(now);
    expect(vm.greeting).toEqual({ localHour: 21, displayName: 'Dana' }); // 20:15 UTC is 21:15 in Lisbon (WEST)
    expect(vm.streak).toMatchObject({ current: 1, todayQualifies: true, atRisk: false });
    expect(vm.level).toMatchObject({ level: 1, title: 'Platform Initiate', xpTotal: 165, xpForLevel: 200, nextLevelAt: 200 });
    expect(vm.todayMission).toEqual({
      worldSlug: 'w1-platform',
      missionSlug: 'w1-m1',
      lessonSlug: 'd002',
      title: 'Savepoints',
      dayIndex: 2,
      progressPct: 40,
      nextStep: 'deep_dive',
      actions: ['continue', 'challenge_me'],
    });
    expect(vm.boss).toEqual({ kind: 'mission', ref: 'w1-m1', title: 'Boss: rollback storm', status: 'locked', availableAt: null, lastRubric: null });
    expect(vm.weakArea).toEqual({ conceptSlug: 'tx.savepoints', name: 'Savepoints', overall: 65, reasons: ['decayed'], reviewSlug: 'tx.savepoints' });
    expect(vm.reviewsDue).toEqual({ due: 2, overdue: 2, nextDueOn: '2026-09-07' });
    expect(vm.recentAchievement).toMatchObject({ id: 'first_light', name: 'First Light', xp: 25 });
    expect(vm.pendingUnlockToasts).toEqual([{ id: 'first_light', name: 'First Light', xp: 25 }]);
    expect(vm.skills.find((s) => s.id === 'platform')).toEqual({ id: 'platform', label: 'Platform Knowledge', pct: 58, coveragePct: 100, explored: 2, total: 2 });
    expect(vm.skills.find((s) => s.id === 'data')).toMatchObject({ pct: 0, explored: 0, total: 1 });
    expect(vm.longTerm).toEqual({ pct: 0, dayIndex: 2, calendarDay: 7, lessonsCompleted: 1, lessonsCompetent: 0 });
    expect(vm.stats).toMatchObject({ bossesDefeated: 0, labsCompleted: 0, conceptsMastered: 0, reviewDebt: 2, calibration: null, timeSpentMs: 240_000 });
    expect(vm.stats.repeatedMistakes).toEqual([{ misconceptionId: 'all-or-nothing', count: 2, conceptSlug: 'tx' }]);
    expect(vm.xpToday).toEqual({
      amount: 80,
      events: [
        { reason: 'teach_back_passed', amount: 60, ref: null },
        { reason: 'band_reached', amount: 20, ref: 'tx.savepoints:developing' },
      ],
    });
  });

  it('picks the weak area among recently attempted weak leaves only', () => {
    const vm = buildDashboardViewModel(richContext(), now, config);
    // tx (aggregate 58, repeated misconception) is a parent here; tx.savepoints (decayed review) is the only weak leaf attempted in the window.
    expect(vm.weakArea?.conceptSlug).toBe('tx.savepoints');
  });

  it('handles an empty learner and a Date instance for now', () => {
    const vm = buildDashboardViewModel(makeContext(), new Date(now), config);
    expect(vm.todayMission).toBeNull();
    expect(vm.boss?.status).toBe('locked');
    expect(vm.weakArea).toBeNull();
    expect(vm.recentAchievement).toBeNull();
    expect(vm.pendingUnlockToasts).toEqual([]);
    expect(vm.streak.current).toBe(0);
    expect(vm.longTerm).toEqual({ pct: 0, dayIndex: 1, calendarDay: 1, lessonsCompleted: 0, lessonsCompetent: 0 });
    expect(vm.xpToday).toEqual({ amount: 0, events: [] });
  });

  it('surfaces a defeated boss rubric summary and caps toasts at guardrails.maxToasts', () => {
    const ctx = richContext();
    const defeated = makeAttempt({
      kind: 'boss',
      questionType: 'boss',
      bossKind: 'mission',
      bossRef: 'w1-m1',
      conceptId: null,
      conceptIds: ['tx'],
      localDate: '2026-09-07',
      llmEvaluation: { ...makeBossRubric({ tradeOffs: 55 }), defeated: true },
    });
    const vm = buildDashboardViewModel(
      {
        ...ctx,
        attempts: [...ctx.attempts, defeated],
        lessonProgress: [makeProgress({ lessonSlug: 'd001' }), makeProgress({ lessonSlug: 'd002' })],
        xpTransactions: [
          ...ctx.xpTransactions,
          makeXp({ localDate: '2026-09-07', reason: 'achievement_unlocked', ref: 'first_blood', base: 100 }),
          makeXp({ localDate: '2026-09-07', reason: 'achievement_unlocked', ref: 'world_cleared:w1-platform', base: 200 }),
        ],
      },
      now,
      config,
    );
    // w1-m1 is defeated, so the dashboard shows the next actionable boss: w2-m1, locked until d004 completes.
    expect(vm.boss).toMatchObject({ ref: 'w2-m1', status: 'locked' });
    expect(vm.stats.bossesDefeated).toBe(1);
    expect(vm.recentAchievement).toMatchObject({ id: 'world_cleared:w1-platform', name: 'World Cleared', xp: 200 });
    expect(vm.pendingUnlockToasts).toHaveLength(config.guardrails.maxToasts);
  });
});

describe('buildProgressViewModel', () => {
  it('rolls worlds, ISO weeks, history, map, skills and radar out of the same context', () => {
    const vm = buildProgressViewModel(richContext(), now, config);
    expect(vm.worlds).toEqual([
      { slug: 'w1-platform', name: 'Platform', coreLessons: 3, completed: 1, competent: 0, bosses: { defeated: 0, total: 1 }, meanOverall: 58 },
      { slug: 'w2-data', name: 'Data', coreLessons: 1, completed: 0, competent: 0, bosses: { defeated: 0, total: 1 }, meanOverall: null },
    ]);
    expect(vm.weekly).toEqual([
      { isoWeek: '2026-W36', xp: 85, attempts: 3, lessonsCompleted: 1, bandUps: 0 },
      { isoWeek: '2026-W37', xp: 80, attempts: 1, lessonsCompleted: 0, bandUps: 1 },
    ]);
    expect(vm.history).toEqual([
      { localDate: '2026-09-01', xp: 85, attempts: 2 },
      { localDate: '2026-09-02', xp: 0, attempts: 1 },
      { localDate: '2026-09-07', xp: 80, attempts: 1 },
    ]);
    expect(vm.knowledgeMap.map((n) => n.slug)).toEqual(['tx', 'soql.ldv']);
    expect(vm.knowledgeMap[0]).toMatchObject({ overall: 58, weak: true, flaggedDescendants: 1 });
    expect(vm.skills).toHaveLength(6);
    expect(vm.radar).toEqual({ recall: 58, understanding: 58, application: 58, debugging: 58, architecture: 58, teach_back: 58 });
    expect(vm.repeatedMistakes).toEqual([{ misconceptionId: 'all-or-nothing', count: 2, conceptSlug: 'tx' }]);
  });

  it('returns a null radar and empty series for an empty learner', () => {
    const vm = buildProgressViewModel(makeContext(), now, config);
    expect(vm.radar).toBeNull();
    expect(vm.weekly).toEqual([]);
    expect(vm.history).toEqual([]);
    expect(vm.worlds[0]).toMatchObject({ slug: 'w1-platform', coreLessons: 1, completed: 0, meanOverall: null });
  });
});

describe('toAchievementContext', () => {
  it('appends the attempt being recorded and derives the streak with it', () => {
    const ctx = richContext();
    const attempt = makeAttempt({ conceptId: 'tx', localDate: '2026-09-07', kind: 'explain_why', questionType: 'explain_why' });
    const actx = toAchievementContext(ctx, { attempt, xpEventsSoFar: [], masteryBefore: null, masteryAfter: null }, config);
    expect(actx.attempts.at(-1)).toBe(attempt);
    expect(actx.attempts).toHaveLength(ctx.attempts.length + 1);
    expect(actx.streak.todayQualifies).toBe(true);
    expect(actx.missions).toBe(ctx.registry.missions);
    expect(actx.todayLocal).toBe('2026-09-07');
  });
});

describe('date helpers used by the view models', () => {
  it('isoWeekOf follows ISO-8601 (week 1 holds January 4th; late December can belong to week 1)', () => {
    expect(isoWeekOf('2026-01-04')).toBe('2026-W01');
    expect(isoWeekOf('2026-09-07')).toBe('2026-W37');
    expect(isoWeekOf('2024-12-30')).toBe('2025-W01');
    expect(isoWeekOf('2021-01-03')).toBe('2020-W53');
  });

  it('localHourOf respects the zone and falls back to UTC for an invalid one', () => {
    expect(localHourOf(now, 'America/Los_Angeles')).toBe(13);
    expect(localHourOf(now, 'Asia/Tokyo')).toBe(5);
    expect(localHourOf('2026-09-07T23:30:00.000Z', 'UTC')).toBe(23);
    expect(localHourOf(now, 'Mars/Olympus_Mons')).toBe(20);
  });
});
