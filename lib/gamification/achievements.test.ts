import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementFor, evaluateAchievements, type AchievementContext } from './achievements.ts';
import { GAMIFICATION_CONFIG } from './config.ts';
import { xpTotal } from './level.ts';
import { makeAttempt, makeMastery, makeMission, makeReviewItem, makeXp } from './testing.ts';
import type { XpEvent } from './types.ts';

const config = GAMIFICATION_CONFIG;

function actx(o: Partial<AchievementContext> = {}): AchievementContext {
  const attempt = o.attempt ?? o.attempts?.[o.attempts.length - 1] ?? makeAttempt();
  return {
    attempt,
    attempts: o.attempts ?? [attempt],
    xpTransactions: [],
    xpEventsSoFar: [],
    masteries: [],
    masteryBefore: null,
    masteryAfter: null,
    reviewItems: [],
    streak: { current: 0, longest: 0, shieldBanked: false, atRisk: true, todayQualifies: false },
    missions: [],
    todayLocal: '2026-09-07',
    config,
    ...o,
  };
}

function refs(ctx: AchievementContext): string[] {
  return evaluateAchievements(ctx).map((e) => e.ref ?? '');
}

const flat = (reason: XpEvent['reason'], ref: string | null, amount = 10): XpEvent => ({ reason, ref, base: amount, multiplier: 1, amount });

describe('ACHIEVEMENTS catalog', () => {
  const TABLE: Array<[string, boolean, number]> = [
    ['first_light', false, 25],
    ['why_not_what', false, 50],
    ['prophet', false, 50],
    ['caveman_translator', false, 75],
    ['governor_limit_survivor', false, 100],
    ['order_keeper', false, 75],
    ['gatekeeper', false, 75],
    ['selective_mind', false, 75],
    ['bulkifier', false, 50],
    ['first_blood', false, 100],
    ['world_cleared', false, 200],
    ['week_one', false, 50],
    ['month_one', false, 150],
    ['centurion', false, 300],
    ['three_angles', true, 50],
    ['comeback', true, 100],
    ['debt_free', true, 75],
    ['calibrated', true, 100],
    ['architect', true, 150],
    ['depth_quest_complete', false, 500],
  ];

  it('contains every row of the table exactly once', () => {
    expect(ACHIEVEMENTS.map((a) => a.id).sort()).toEqual(TABLE.map(([id]) => id).sort());
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it.each(TABLE)('%s hidden=%s xp=%i', (id, hidden, xp) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    expect(a).toBeDefined();
    expect(a?.hidden).toBe(hidden);
    expect(a?.xp).toBe(xp);
    expect(a?.name.length).toBeGreaterThan(0);
  });

  it('total catalog XP (world_cleared x 6 worlds) stays under maxAchievementXpShare of xpTotal(maxLevel)', () => {
    const total = ACHIEVEMENTS.reduce((sum, a) => sum + a.xp * (a.maxUnlocks ?? 1), 0);
    expect(total).toBeGreaterThan(3_000);
    expect(total).toBeLessThanOrEqual(config.guardrails.maxAchievementXpShare * xpTotal(config.level.maxLevel, config));
  });

  it('resolves parametrised refs back to their catalog row', () => {
    expect(achievementFor('world_cleared:w2-data')?.id).toBe('world_cleared');
    expect(achievementFor('first_light')?.id).toBe('first_light');
    expect(achievementFor('nope')).toBeUndefined();
  });
});

describe('evaluateAchievements', () => {
  it('emits achievement_unlocked events with the catalog XP, once, skipping refs already in the ledger', () => {
    const ctx = actx({ xpEventsSoFar: [flat('lesson_completed', 'd001-intro', 50)] });
    const events = evaluateAchievements(ctx);
    expect(events).toEqual([{ reason: 'achievement_unlocked', ref: 'first_light', base: 25, multiplier: 1, amount: 25 }]);
    const already = actx({
      xpEventsSoFar: [flat('lesson_completed', 'd001-intro', 50)],
      xpTransactions: [makeXp({ reason: 'achievement_unlocked', ref: 'first_light', base: 25 })],
    });
    expect(evaluateAchievements(already)).toEqual([]);
  });

  it('first_light: the first lesson_completed row, whether in the ledger or in this attempt', () => {
    expect(refs(actx())).not.toContain('first_light');
    expect(refs(actx({ xpTransactions: [makeXp({ reason: 'lesson_completed', ref: 'd001-intro', base: 50 })] }))).toContain('first_light');
  });

  it('why_not_what: 10 explain_why_passed rows across ledger and this attempt', () => {
    const nine = Array.from({ length: 9 }, () => makeXp({ reason: 'explain_why_passed', base: 25 }));
    expect(refs(actx({ xpTransactions: nine }))).not.toContain('why_not_what');
    expect(refs(actx({ xpTransactions: nine, xpEventsSoFar: [flat('explain_why_passed', 'q', 25)] }))).toContain('why_not_what');
  });

  it('prophet: 25 prediction_correct rows', () => {
    const rows = Array.from({ length: 25 }, () => makeXp({ reason: 'prediction_correct', base: 12 }));
    expect(refs(actx({ xpTransactions: rows.slice(0, 24) }))).not.toContain('prophet');
    expect(refs(actx({ xpTransactions: rows }))).toContain('prophet');
  });

  it('caveman_translator: teach-back passed with understanding >= 85 without jargon', () => {
    const base = { kind: 'teach_back' as const, questionType: 'teach_back' as const, llmEvaluation: { correctness: 80, understanding: 90 } };
    expect(refs(actx({ attempt: makeAttempt({ ...base, probeAngle: 'explain_without_jargon' }) }))).toContain('caveman_translator');
    expect(refs(actx({ attempt: makeAttempt({ ...base, answer: { audience: 'no_jargon', text: '...' } }) }))).toContain('caveman_translator');
    expect(refs(actx({ attempt: makeAttempt({ ...base, probeAngle: 'explain_to_junior' }) }))).not.toContain('caveman_translator');
    expect(
      refs(actx({ attempt: makeAttempt({ ...base, probeAngle: 'explain_without_jargon', llmEvaluation: { correctness: 80, understanding: 84 } }) })),
    ).not.toContain('caveman_translator');
    expect(
      refs(actx({ attempt: makeAttempt({ ...base, probeAngle: 'explain_without_jargon', llmEvaluation: { correctness: 60, understanding: 90 } }) })),
    ).not.toContain('caveman_translator');
  });

  it('governor_limit_survivor: a breach followed by a pass on the same lab exercise', () => {
    const breach = makeAttempt({
      kind: 'lab',
      questionType: 'lab',
      exerciseId: 'd005/lab-gov',
      passed: false,
      correct: false,
      answer: { simulator: 'governor-limits', result: { firstBreach: { opId: 'q1', limit: 'soqlQueries', atIteration: 101, message: 'Too many SOQL queries: 101' } } },
    });
    const pass = makeAttempt({ kind: 'lab', questionType: 'lab', exerciseId: 'd005/lab-gov', passed: true, answer: { simulator: 'governor-limits', result: { firstBreach: undefined } } });
    expect(refs(actx({ attempts: [breach, pass] }))).toContain('governor_limit_survivor');
    expect(refs(actx({ attempts: [pass, breach] }))).not.toContain('governor_limit_survivor');
    const otherExercise = makeAttempt({ ...pass, id: 999, exerciseId: 'd006/lab-gov' });
    expect(refs(actx({ attempts: [breach, otherExercise] }))).not.toContain('governor_limit_survivor');
  });

  it('order_keeper: order_execution correct at depth >= 5', () => {
    expect(refs(actx({ attempt: makeAttempt({ questionType: 'order_execution', depth: 5, correct: true }) }))).toContain('order_keeper');
    expect(refs(actx({ attempt: makeAttempt({ questionType: 'order_execution', depth: 4, correct: true }) }))).not.toContain('order_keeper');
    expect(refs(actx({ attempt: makeAttempt({ questionType: 'order_execution', depth: 6, correct: false }) }))).not.toContain('order_keeper');
  });

  it('gatekeeper: 10 correct sharing lab predictions over >= 3 distinct OWD configs', () => {
    const sharing = (owd: string) => makeAttempt({ kind: 'lab', questionType: 'lab', correct: true, passed: true, answer: { simulator: 'sharing', config: { owd } } });
    const owds = ['private', 'read', 'read', 'read_write', 'private', 'read', 'private', 'read_write', 'read', 'private'];
    expect(refs(actx({ attempts: owds.map(sharing) }))).toContain('gatekeeper');
    expect(refs(actx({ attempts: owds.slice(0, 9).map(sharing) }))).not.toContain('gatekeeper');
    expect(refs(actx({ attempts: owds.map((o) => sharing(o === 'read_write' ? 'read' : o)) }))).not.toContain('gatekeeper');
  });

  it('selective_mind: 5 selectivity lab attempts that made a non-selective query selective', () => {
    const fixed = () => makeAttempt({ kind: 'lab', questionType: 'lab', answer: { simulator: 'soql-selectivity', result: { selectiveBefore: false, selectiveAfter: true } } });
    const already = () => makeAttempt({ kind: 'lab', questionType: 'lab', answer: { simulator: 'soql-selectivity', result: { selectiveBefore: true, selectiveAfter: true } } });
    expect(refs(actx({ attempts: [fixed(), fixed(), fixed(), fixed(), fixed()] }))).toContain('selective_mind');
    expect(refs(actx({ attempts: [fixed(), fixed(), fixed(), fixed(), already()] }))).not.toContain('selective_mind');
  });

  it('bulkifier: explain_why_passed on the soql-in-loops concept', () => {
    const attempt = makeAttempt({ kind: 'explain_why', questionType: 'explain_why', conceptId: 'soql-in-loops', llmEvaluation: { correctness: 80, understanding: 60 } });
    expect(refs(actx({ attempt, xpEventsSoFar: [flat('explain_why_passed', attempt.exerciseId, 25)] }))).toContain('bulkifier');
    const history = makeAttempt({ kind: 'explain_why', questionType: 'explain_why', conceptId: 'soql-in-loops', llmEvaluation: { correctness: 75, understanding: 55 } });
    expect(refs(actx({ attempts: [history, makeAttempt()] }))).toContain('bulkifier');
    const weak = makeAttempt({ kind: 'explain_why', questionType: 'explain_why', conceptId: 'soql-in-loops', llmEvaluation: { correctness: 75, understanding: 40 } });
    expect(refs(actx({ attempt: weak }))).not.toContain('bulkifier');
    const other = makeAttempt({ kind: 'explain_why', questionType: 'explain_why', conceptId: 'soql.selectivity', llmEvaluation: { correctness: 90, understanding: 90 } });
    expect(refs(actx({ attempt: other }))).not.toContain('bulkifier');
  });

  it('first_blood: the first mission_boss_defeated row', () => {
    expect(refs(actx({ xpEventsSoFar: [flat('mission_boss_defeated', 'w1-m1-basics', 150)] }))).toContain('first_blood');
    expect(refs(actx({ xpEventsSoFar: [flat('mission_boss_attempted', 'w1-m1-basics', 20)] }))).not.toContain('first_blood');
  });

  it('world_cleared:<world>: every mission boss of the world defeated', () => {
    const missions = [
      makeMission({ slug: 'w1-m1', worldSlug: 'w1-platform' }),
      makeMission({ slug: 'w1-m2', worldSlug: 'w1-platform', ordinal: 2 }),
      makeMission({ slug: 'w2-m1', worldSlug: 'w2-data' }),
    ];
    const ledger = [makeXp({ reason: 'mission_boss_defeated', ref: 'w1-m1', base: 150 })];
    expect(refs(actx({ missions, xpTransactions: ledger }))).not.toContain('world_cleared:w1-platform');
    const done = refs(actx({ missions, xpTransactions: ledger, xpEventsSoFar: [flat('mission_boss_defeated', 'w1-m2', 150)] }));
    expect(done).toContain('world_cleared:w1-platform');
    expect(done).not.toContain('world_cleared:w2-data');
  });

  it('week_one / month_one / centurion follow the streak', () => {
    const streak = (current: number) => ({ current, longest: current, shieldBanked: false, atRisk: false, todayQualifies: true });
    expect(refs(actx({ streak: streak(6) }))).not.toContain('week_one');
    expect(refs(actx({ streak: streak(7) }))).toEqual(expect.arrayContaining(['week_one']));
    expect(refs(actx({ streak: streak(7) }))).not.toContain('month_one');
    expect(refs(actx({ streak: streak(30) }))).toEqual(expect.arrayContaining(['week_one', 'month_one']));
    expect(refs(actx({ streak: streak(100) }))).toEqual(expect.arrayContaining(['week_one', 'month_one', 'centurion']));
  });

  it('three_angles: one concept answered correctly from 3 distinct probe angles on one local date', () => {
    const probe = (angle: 'why' | 'what_if' | 'what_breaks', localDate = '2026-09-07', conceptId = 'soql.selectivity') =>
      makeAttempt({ kind: 'explain_why', questionType: 'explain_why', conceptId, probeAngle: angle, correct: true, passed: true, localDate });
    expect(refs(actx({ attempts: [probe('why'), probe('what_if'), probe('what_breaks')] }))).toContain('three_angles');
    expect(refs(actx({ attempts: [probe('why'), probe('what_if'), probe('why')] }))).not.toContain('three_angles');
    expect(refs(actx({ attempts: [probe('why'), probe('what_if'), probe('what_breaks', '2026-09-06')] }))).not.toContain('three_angles');
    expect(refs(actx({ attempts: [probe('why'), probe('what_if'), probe('what_breaks', '2026-09-07', 'other')] }))).not.toContain('three_angles');
    const wrong = { ...probe('what_breaks'), correct: false, passed: false };
    expect(refs(actx({ attempts: [probe('why'), probe('what_if'), wrong] }))).not.toContain('three_angles');
  });

  it('comeback: a concept moves from Lost with evidence to Competent or better', () => {
    const lost = makeMastery({ conceptId: 'c', overall: 30, band: 'lost', evidenceCount: 2 });
    const competent = makeMastery({ conceptId: 'c', overall: 76, band: 'competent', evidenceCount: 9 });
    expect(refs(actx({ masteryBefore: lost, masteryAfter: competent }))).toContain('comeback');
    expect(refs(actx({ masteryBefore: { ...lost, evidenceCount: 0 }, masteryAfter: competent }))).not.toContain('comeback');
    expect(refs(actx({ masteryBefore: { ...lost, band: 'familiar', overall: 45 }, masteryAfter: competent }))).not.toContain('comeback');
    expect(refs(actx({ masteryBefore: lost, masteryAfter: { ...competent, band: 'developing', overall: 70 } }))).not.toContain('comeback');
  });

  it('debt_free: review debt goes from >= 10 to 0 within one local date', () => {
    const items = Array.from({ length: 10 }, () => makeReviewItem({ dueOn: '2026-09-07' }));
    const reviews = items.map((r) => makeAttempt({ reviewItemId: r.id, localDate: '2026-09-07' }));
    expect(refs(actx({ reviewItems: items, attempts: reviews }))).toContain('debt_free');
    expect(refs(actx({ reviewItems: items, attempts: reviews.slice(0, 9) }))).not.toContain('debt_free');
    const nine = items.slice(0, 9);
    expect(refs(actx({ reviewItems: nine, attempts: reviews.slice(0, 9) }))).not.toContain('debt_free');
    const yesterday = reviews.map((a) => ({ ...a, localDate: '2026-09-06' }));
    expect(refs(actx({ reviewItems: items, attempts: yesterday }))).not.toContain('debt_free');
  });

  it('calibrated: |mean(confidence/5) - accuracy| <= 0.10 over the last 30 rated attempts, at least 10 of them', () => {
    const rated = (n: number, selfConfidence: number, correct: boolean) =>
      Array.from({ length: n }, () => makeAttempt({ selfConfidence, correct, passed: correct }));
    expect(refs(actx({ attempts: rated(10, 5, true) }))).toContain('calibrated');
    expect(refs(actx({ attempts: rated(9, 5, true) }))).not.toContain('calibrated');
    expect(refs(actx({ attempts: rated(10, 5, false) }))).not.toContain('calibrated');
    expect(refs(actx({ attempts: [...rated(5, 4, true), ...rated(5, 4, false)] }))).not.toContain('calibrated'); // 0.8 - 0.5
  });

  it('architect: a weekly boss rubric with tradeOffs >= 85', () => {
    const weekly = makeAttempt({ kind: 'boss', questionType: 'boss', bossKind: 'weekly', bossRef: 'weekly-w02', conceptId: null, conceptIds: ['c'], llmEvaluation: { tradeOffs: 85, defeated: false } });
    expect(refs(actx({ attempt: weekly }))).toContain('architect');
    expect(refs(actx({ attempt: { ...weekly, llmEvaluation: { tradeOffs: 84 } } }))).not.toContain('architect');
    expect(refs(actx({ attempt: { ...weekly, bossKind: 'mission', bossRef: 'w1-m1', llmEvaluation: { tradeOffs: 95 } } }))).not.toContain('architect');
  });

  it('depth_quest_complete: a capstone_passed row exists', () => {
    expect(refs(actx({ xpEventsSoFar: [flat('capstone_passed', 'capstone', 1000)] }))).toContain('depth_quest_complete');
    expect(refs(actx({ xpEventsSoFar: [flat('capstone_attempted', 'capstone', 300)] }))).not.toContain('depth_quest_complete');
  });
});
