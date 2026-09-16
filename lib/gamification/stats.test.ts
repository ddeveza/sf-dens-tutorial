import { describe, expect, it } from 'vitest';
import { GAMIFICATION_CONFIG } from './config.ts';
import { bossesDefeated, calibration, deriveStats, labsCompleted, repeatedMistakes, reviewsDue } from './stats.ts';
import { makeAttempt, makeBossRubric, makeCapstoneRubric, makeMastery, makeReviewItem, scores } from './testing.ts';
import type { AttemptRow, MasteryRow } from './context.ts';

const config = GAMIFICATION_CONFIG;
const today = '2026-09-07';

const noEvidence = { recall: 0, understanding: 0, application: 0, debugging: 0, architecture: 0, teach_back: 0 };

function boss(o: Partial<Parameters<typeof makeBossRubric>[0]>, extra: Partial<AttemptRow> = {}): AttemptRow {
  return makeAttempt({
    kind: 'boss',
    questionType: 'boss',
    bossKind: 'mission',
    bossRef: 'm1',
    conceptId: null,
    conceptIds: ['c'],
    llmEvaluation: { ...makeBossRubric(o), defeated: false },
    ...extra,
  });
}

function stats(attempts: AttemptRow[] = [], masteries: MasteryRow[] = [], reviewItems = [] as ReturnType<typeof makeReviewItem>[]) {
  return deriveStats({ attempts, masteries, reviewItems, todayLocal: today }, config);
}

describe('counts', () => {
  it('bossesDefeated counts distinct defeated refs across boss and capstone rows', () => {
    const rows = [
      boss({}, { llmEvaluation: { defeated: true }, bossRef: 'm1' }),
      boss({}, { llmEvaluation: { defeated: true }, bossRef: 'm1' }),
      boss({}, { llmEvaluation: { defeated: false }, bossRef: 'm2' }),
      boss({}, { kind: 'capstone', questionType: 'capstone', bossKind: 'capstone', bossRef: 'capstone', llmEvaluation: { defeated: true } }),
    ];
    expect(bossesDefeated(rows)).toBe(2);
    expect(stats(rows).bossesDefeated).toBe(2);
  });

  it('labsCompleted counts distinct passed lab exercises', () => {
    const rows = [
      makeAttempt({ kind: 'lab', questionType: 'lab', exerciseId: 'l1', passed: true }),
      makeAttempt({ kind: 'lab', questionType: 'lab', exerciseId: 'l1', passed: true }),
      makeAttempt({ kind: 'lab', questionType: 'lab', exerciseId: 'l2', passed: false }),
      makeAttempt({ exerciseId: 'q1', passed: true }),
    ];
    expect(labsCompleted(rows)).toBe(1);
  });

  it('conceptsMastered counts mastered bands; timeSpentMs sums duration', () => {
    const s = stats([makeAttempt({ durationMs: 1000 }), makeAttempt({ durationMs: 2500 })], [makeMastery({ conceptId: 'a', overall: 96 }), makeMastery({ conceptId: 'b', overall: 90 })]);
    expect(s.conceptsMastered).toBe(1);
    expect(s.timeSpentMs).toBe(3500);
  });
});

describe('architectureScore / debuggingScore', () => {
  it('is null with no architecture evidence and no boss attempts', () => {
    const s = stats([], [makeMastery({ conceptId: 'a', overall: 80, evidenceByDimension: { ...noEvidence, recall: 3 } })]);
    expect(s.architectureScore).toBeNull();
    expect(s.debuggingScore).toBeNull();
  });

  it('uses mastery alone when there are no boss attempts', () => {
    const rows = [
      makeMastery({ conceptId: 'a', scores: scores(70, { architecture: 90, debugging: 40 }) }),
      makeMastery({ conceptId: 'b', scores: scores(70, { architecture: 70, debugging: 60 }) }),
      makeMastery({ conceptId: 'c', scores: scores(70, { architecture: 0, debugging: 0 }), evidenceByDimension: { ...noEvidence, recall: 1 } }),
    ];
    const s = stats([], rows);
    expect(s.architectureScore).toBe(80);
    expect(s.debuggingScore).toBe(50);
  });

  it('uses bosses alone when there is no mastery evidence', () => {
    const rows = [boss({ solution: 80, tradeOffs: 40, suspect: 60, why: 60, dataNeeded: 70, whatToInspect: 90 })];
    const s = stats(rows, []);
    expect(s.architectureScore).toBe(60);
    expect(s.debuggingScore).toBe(70);
  });

  it('blends 0.6 mastery + 0.4 bosses over the last 5 boss attempts', () => {
    const masteries = [makeMastery({ conceptId: 'a', scores: scores(70, { architecture: 80, debugging: 80 }) })];
    const old = boss({ solution: 0, tradeOffs: 0, suspect: 0, why: 0, dataNeeded: 0, whatToInspect: 0 }, { localDate: '2026-08-01' });
    const recent = Array.from({ length: 5 }, () => boss({ solution: 60, tradeOffs: 60, suspect: 50, why: 50, dataNeeded: 50, whatToInspect: 50 }, { localDate: '2026-09-01' }));
    const s = stats([old, ...recent], masteries);
    expect(s.architectureScore).toBe(72); // 0.6 x 80 + 0.4 x 60
    expect(s.debuggingScore).toBe(68); // 0.6 x 80 + 0.4 x 50
  });

  it('blends the capstone at 0.5 into architecture only', () => {
    const masteries = [makeMastery({ conceptId: 'a', scores: scores(70, { architecture: 80, debugging: 80 }) })];
    const rows = [
      boss({ solution: 60, tradeOffs: 60, suspect: 50, why: 50, dataNeeded: 50, whatToInspect: 50 }),
      makeAttempt({
        kind: 'capstone',
        questionType: 'capstone',
        bossKind: 'capstone',
        bossRef: 'capstone',
        conceptId: null,
        conceptIds: ['c'],
        llmEvaluation: { ...makeCapstoneRubric({ dataArchitecture: 100, scalability: 100, performance: 100, reliability: 100, tradeOffReasoning: 100 }), defeated: true },
      }),
    ];
    const s = stats(rows, masteries);
    expect(s.architectureScore).toBe(86); // 0.5 x 72 + 0.5 x 100
    expect(s.debuggingScore).toBe(68);
  });
});

describe('review debt and due_on boundary', () => {
  it('due = due_on <= today, overdue = due_on < today', () => {
    const items = [
      makeReviewItem({ dueOn: '2026-09-06' }),
      makeReviewItem({ dueOn: '2026-09-07' }),
      makeReviewItem({ dueOn: '2026-09-08' }),
    ];
    expect(reviewsDue(items, today)).toEqual({ due: 2, overdue: 1, nextDueOn: '2026-09-07' });
    expect(stats([], [], items).reviewDebt).toBe(2);
  });

  it('nextDueOn is the earliest future date when nothing is due, null without items', () => {
    expect(reviewsDue([makeReviewItem({ dueOn: '2026-09-20' }), makeReviewItem({ dueOn: '2026-09-09' })], today)).toEqual({ due: 0, overdue: 0, nextDueOn: '2026-09-09' });
    expect(reviewsDue([], today)).toEqual({ due: 0, overdue: 0, nextDueOn: null });
  });
});

describe('repeatedMistakes', () => {
  it('lists misconception ids seen on >= 2 attempts with counts and the concept, most frequent first', () => {
    const rows = [
      makeAttempt({ conceptId: 'soql.ldv', misconceptionIds: ['skew'] }),
      makeAttempt({ conceptId: 'soql.ldv', misconceptionIds: ['skew', 'index'] }),
      makeAttempt({ conceptId: 'soql.ldv', misconceptionIds: ['skew'] }),
      makeAttempt({ conceptId: 'soql.indexes', misconceptionIds: ['index'] }),
      makeAttempt({ conceptId: 'apex', misconceptionIds: ['once'] }),
    ];
    expect(repeatedMistakes(rows, config)).toEqual([
      { misconceptionId: 'skew', count: 3, conceptSlug: 'soql.ldv' },
      { misconceptionId: 'index', count: 2, conceptSlug: 'soql.indexes' },
    ]);
    expect(stats(rows).repeatedMistakes).toHaveLength(2);
  });

  it('falls back to the first fanned-out concept for boss rows', () => {
    const rows = [boss({}, { misconceptionIds: ['m'], conceptIds: ['x', 'y'] }), boss({}, { misconceptionIds: ['m'], conceptIds: ['x', 'y'] })];
    expect(repeatedMistakes(rows, config)).toEqual([{ misconceptionId: 'm', count: 2, conceptSlug: 'x' }]);
  });
});

describe('calibration', () => {
  const rated = (n: number, selfConfidence: number, correct: boolean, localDate = today) =>
    Array.from({ length: n }, () => makeAttempt({ selfConfidence, correct, passed: correct, localDate }));

  it('is null with fewer than 10 rated attempts', () => {
    expect(calibration(rated(9, 5, true), config)).toBeNull();
    const unrated = Array.from({ length: 5 }, () => makeAttempt({ selfConfidence: null }));
    expect(calibration([...rated(9, 5, true), ...unrated], config)).toBeNull();
  });

  it('is mean(confidence/5) - accuracy: positive = overconfident', () => {
    expect(calibration(rated(10, 5, true), config)).toBe(0);
    expect(calibration(rated(10, 5, false), config)).toBe(1);
    expect(calibration([...rated(5, 4, true), ...rated(5, 4, false)], config)).toBeCloseTo(0.3, 5); // 0.8 - 0.5
    expect(calibration(rated(10, 1, true), config)).toBeCloseTo(-0.8, 5);
  });

  it('only looks at the last 30 rated attempts', () => {
    const old = rated(30, 5, false, '2026-08-01');
    const recent = rated(30, 5, true, '2026-09-01');
    expect(calibration([...old, ...recent], config)).toBe(0);
    expect(stats([...old, ...recent]).calibration).toBe(0);
  });
});
