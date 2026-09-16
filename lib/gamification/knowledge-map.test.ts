import { describe, expect, it } from 'vitest';
import { GAMIFICATION_CONFIG } from './config.ts';
import { deriveKnowledgeMap, flattenNodes, isWeak, pickWeakArea } from './knowledge-map.ts';
import { makeAttempt, makeConcept, makeMastery, makeReviewItem, scores } from './testing.ts';

const config = GAMIFICATION_CONFIG;
const today = '2026-09-07';

const tree = [
  makeConcept({ slug: 'soql', title: 'SOQL' }),
  makeConcept({ slug: 'soql.basic', parentSlug: 'soql', title: 'Basic queries' }),
  makeConcept({ slug: 'soql.selectivity', parentSlug: 'soql', title: 'Selectivity' }),
  makeConcept({ slug: 'soql.indexes', parentSlug: 'soql', title: 'Indexes' }),
  makeConcept({ slug: 'soql.optimizer', parentSlug: 'soql', title: 'Query optimizer' }),
  makeConcept({ slug: 'soql.ldv', parentSlug: 'soql', title: 'LDV' }),
];

function evidence(conceptId: string, n = 1, localDate = today) {
  return Array.from({ length: n }, () => makeAttempt({ conceptId, localDate }));
}

describe('isWeak', () => {
  it('unexplored is never weak', () => {
    expect(isWeak({ mastery: null, attempts: [], reviewItem: null, todayLocal: today }, config)).toEqual({ weak: false, reasons: [] });
  });

  it('below_developing: overall under the threshold with evidence', () => {
    const r = isWeak({ mastery: makeMastery({ conceptId: 'c', overall: 59 }), attempts: evidence('c'), reviewItem: null, todayLocal: today }, config);
    expect(r).toEqual({ weak: true, reasons: ['below_developing'] });
    expect(isWeak({ mastery: makeMastery({ conceptId: 'c', overall: 60 }), attempts: evidence('c'), reviewItem: null, todayLocal: today }, config).weak).toBe(false);
  });

  it('lopsided: an evidenced dimension >= 25 points below overall (recall 90 / debugging 40)', () => {
    const mastery = makeMastery({ conceptId: 'c', overall: 71, scores: scores(71, { recall: 90, debugging: 44 }) });
    expect(isWeak({ mastery, attempts: evidence('c'), reviewItem: null, todayLocal: today }, config)).toEqual({ weak: true, reasons: ['lopsided'] });
    const close = makeMastery({ conceptId: 'c', overall: 71, scores: scores(71, { debugging: 47 }) });
    expect(isWeak({ mastery: close, attempts: evidence('c'), reviewItem: null, todayLocal: today }, config).weak).toBe(false);
  });

  it('lopsided ignores dimensions without evidence', () => {
    const mastery = makeMastery({
      conceptId: 'c',
      overall: 80,
      scores: scores(80, { architecture: 0 }),
      evidenceByDimension: { recall: 2, understanding: 1, application: 1, debugging: 1, architecture: 0, teach_back: 1 },
    });
    expect(isWeak({ mastery, attempts: evidence('c'), reviewItem: null, todayLocal: today }, config).weak).toBe(false);
  });

  it('repeated_misconception: a misconception id on >= 2 attempts of the concept', () => {
    const attempts = [
      makeAttempt({ conceptId: 'c', misconceptionIds: ['ldv-skew'] }),
      makeAttempt({ conceptId: 'c', misconceptionIds: ['ldv-skew', 'other'] }),
    ];
    const r = isWeak({ mastery: makeMastery({ conceptId: 'c', overall: 80 }), attempts, reviewItem: null, todayLocal: today }, config);
    expect(r).toEqual({ weak: true, reasons: ['repeated_misconception'] });
    const once = [attempts[0], makeAttempt({ conceptId: 'c', misconceptionIds: ['other'] })];
    expect(isWeak({ mastery: makeMastery({ conceptId: 'c', overall: 80 }), attempts: once, reviewItem: null, todayLocal: today }, config).weak).toBe(false);
  });

  it('decayed: review item due 14 or more days ago (pure date arithmetic)', () => {
    const mastery = makeMastery({ conceptId: 'c', overall: 80 });
    const decayed = isWeak({ mastery, attempts: evidence('c'), reviewItem: makeReviewItem({ conceptId: 'c', dueOn: '2026-08-24' }), todayLocal: today }, config);
    expect(decayed).toEqual({ weak: true, reasons: ['decayed'] });
    const fresh = isWeak({ mastery, attempts: evidence('c'), reviewItem: makeReviewItem({ conceptId: 'c', dueOn: '2026-08-25' }), todayLocal: today }, config);
    expect(fresh.weak).toBe(false);
  });

  it('reports every applicable reason in catalog order', () => {
    const mastery = makeMastery({ conceptId: 'c', overall: 46, scores: scores(46, { recall: 80 }) });
    const attempts = [makeAttempt({ conceptId: 'c', misconceptionIds: ['m'] }), makeAttempt({ conceptId: 'c', misconceptionIds: ['m'] })];
    const r = isWeak({ mastery, attempts, reviewItem: makeReviewItem({ conceptId: 'c', dueOn: '2026-01-01' }), todayLocal: today }, config);
    expect(r.reasons).toEqual(['below_developing', 'repeated_misconception', 'decayed']);
  });

  it('a mastery row with evidence counts as evidence even without attempt rows', () => {
    expect(isWeak({ mastery: makeMastery({ conceptId: 'c', overall: 20, evidenceCount: 1 }), attempts: [], reviewItem: null, todayLocal: today }, config).weak).toBe(true);
    expect(isWeak({ mastery: makeMastery({ conceptId: 'c', overall: 20, evidenceCount: 0 }), attempts: [], reviewItem: null, todayLocal: today }, config).weak).toBe(false);
  });
});

describe('deriveKnowledgeMap', () => {
  const masteries = [
    makeMastery({ conceptId: 'soql.basic', overall: 95 }),
    makeMastery({ conceptId: 'soql.selectivity', overall: 82 }),
    makeMastery({ conceptId: 'soql.indexes', overall: 71, scores: scores(71, { debugging: 44 }) }),
    makeMastery({ conceptId: 'soql.optimizer', overall: 58 }),
    makeMastery({ conceptId: 'soql.ldv', overall: 46 }),
  ];
  const attempts = [
    ...evidence('soql.basic'),
    ...evidence('soql.selectivity'),
    ...evidence('soql.indexes'),
    ...evidence('soql.optimizer'),
    makeAttempt({ conceptId: 'soql.ldv', misconceptionIds: ['ldv-skew'] }),
    makeAttempt({ conceptId: 'soql.ldv', misconceptionIds: ['ldv-skew'] }),
  ];

  it('renders the documented SOQL example: parent aggregate 70 with 3 flagged children', () => {
    const [soql] = deriveKnowledgeMap(tree, masteries, attempts, [], today, config);
    expect(soql).toMatchObject({ slug: 'soql', name: 'SOQL', depth: 0, overall: 70, band: null, dimensions: null, weak: false, flaggedDescendants: 3 });
    const bySlug = Object.fromEntries(soql.children.map((c) => [c.slug, c]));
    expect(bySlug['soql.basic']).toMatchObject({ overall: 95, band: 'mastered', weak: false, depth: 1 });
    expect(bySlug['soql.selectivity']).toMatchObject({ overall: 82, weak: false });
    expect(bySlug['soql.indexes']).toMatchObject({ overall: 71, weak: true, weakReasons: ['lopsided'] });
    expect(bySlug['soql.optimizer']).toMatchObject({ overall: 58, weak: true, weakReasons: ['below_developing'] });
    expect(bySlug['soql.ldv']).toMatchObject({ overall: 46, weak: true, weakReasons: ['below_developing', 'repeated_misconception'] });
    expect(bySlug['soql.basic'].dimensions).toEqual(scores(95));
  });

  it('unexplored leaves are null and not weak; a parent with no evidence anywhere is null', () => {
    const [soql] = deriveKnowledgeMap(tree, [], [], [], today, config);
    expect(soql.overall).toBeNull();
    expect(soql.weak).toBe(false);
    expect(soql.flaggedDescendants).toBe(0);
    expect(soql.children.every((c) => c.overall === null && !c.weak && c.band === null)).toBe(true);
  });

  it('a parent with its own evidence aggregates its own row with the evidenced leaves, importance-weighted', () => {
    const concepts = [
      makeConcept({ slug: 'tx', importance: 2 }),
      makeConcept({ slug: 'tx.savepoints', parentSlug: 'tx', importance: 1 }),
      makeConcept({ slug: 'tx.limits', parentSlug: 'tx', importance: 1 }),
    ];
    const rows = [makeMastery({ conceptId: 'tx', overall: 40 }), makeMastery({ conceptId: 'tx.savepoints', overall: 80 })];
    const [tx] = deriveKnowledgeMap(concepts, rows, [...evidence('tx'), ...evidence('tx.savepoints')], [], today, config);
    // (2 x 40 + 1 x 80) / 3 = 53.3 -> 53; the unexplored leaf does not vote
    expect(tx.overall).toBe(53);
    expect(tx.band).toBe('familiar');
    expect(tx.dimensions).toEqual(scores(40));
    expect(tx.weak).toBe(true);
    expect(tx.weakReasons).toEqual(['below_developing']);
  });

  it('a parent is weak only through its own aggregate; otherwise it just counts flagged descendants', () => {
    const concepts = [makeConcept({ slug: 'p' }), makeConcept({ slug: 'p.a', parentSlug: 'p' }), makeConcept({ slug: 'p.b', parentSlug: 'p' })];
    const strong = [makeMastery({ conceptId: 'p.a', overall: 90 }), makeMastery({ conceptId: 'p.b', overall: 50 })];
    const [p] = deriveKnowledgeMap(concepts, strong, [...evidence('p.a'), ...evidence('p.b')], [], today, config);
    expect(p).toMatchObject({ overall: 70, weak: false, flaggedDescendants: 1 });
    const low = [makeMastery({ conceptId: 'p.a', overall: 30 }), makeMastery({ conceptId: 'p.b', overall: 40 })];
    const [q] = deriveKnowledgeMap(concepts, low, [...evidence('p.a'), ...evidence('p.b')], [], today, config);
    expect(q).toMatchObject({ overall: 35, weak: true, weakReasons: ['below_developing'], flaggedDescendants: 2 });
  });

  it('counts flagged descendants through nested parents and flattens depth-first', () => {
    const concepts = [
      makeConcept({ slug: 'a' }),
      makeConcept({ slug: 'a.b', parentSlug: 'a' }),
      makeConcept({ slug: 'a.b.c', parentSlug: 'a.b' }),
      makeConcept({ slug: 'a.b.d', parentSlug: 'a.b' }),
    ];
    const rows = [makeMastery({ conceptId: 'a.b.c', overall: 20 }), makeMastery({ conceptId: 'a.b.d', overall: 90 })];
    const nodes = deriveKnowledgeMap(concepts, rows, [...evidence('a.b.c'), ...evidence('a.b.d')], [], today, config);
    expect(nodes[0].flaggedDescendants).toBe(2); // a.b (aggregate 55 -> weak) and a.b.c
    expect(nodes[0].children[0]).toMatchObject({ slug: 'a.b', depth: 1, overall: 55, weak: true, flaggedDescendants: 1 });
    expect(flattenNodes(nodes).map((n) => n.slug)).toEqual(['a', 'a.b', 'a.b.c', 'a.b.d']);
  });

  it('treats a concept whose parent is not registered as a root', () => {
    const nodes = deriveKnowledgeMap([makeConcept({ slug: 'orphan.child', parentSlug: 'orphan' })], [], [], [], today, config);
    expect(nodes.map((n) => n.slug)).toEqual(['orphan.child']);
    expect(nodes[0].depth).toBe(0);
  });
});

describe('pickWeakArea', () => {
  it('picks the weak leaf with the lowest overall among concepts attempted in the last 30 days, ties by most recent attempt', () => {
    const rows = [
      makeMastery({ conceptId: 'soql.optimizer', overall: 58 }),
      makeMastery({ conceptId: 'soql.ldv', overall: 46 }),
      makeMastery({ conceptId: 'soql.indexes', overall: 46 }),
    ];
    const recent = [
      makeAttempt({ conceptId: 'soql.optimizer', localDate: '2026-09-01' }),
      makeAttempt({ conceptId: 'soql.ldv', localDate: '2026-08-01' }), // outside the 30-day window
      makeAttempt({ conceptId: 'soql.indexes', localDate: '2026-09-06' }),
    ];
    const nodes = deriveKnowledgeMap(tree, rows, recent, [], today, config);
    expect(pickWeakArea(nodes, recent, today, config)?.slug).toBe('soql.indexes');
    const tie = [...recent, makeAttempt({ conceptId: 'soql.ldv', localDate: '2026-09-07' })];
    const tied = deriveKnowledgeMap(tree, rows, tie, [], today, config);
    expect(pickWeakArea(tied, tie, today, config)?.slug).toBe('soql.ldv');
  });

  it('returns null when nothing weak was attempted recently', () => {
    const rows = [makeMastery({ conceptId: 'soql.ldv', overall: 20 })];
    const old = [makeAttempt({ conceptId: 'soql.ldv', localDate: '2026-07-01' })];
    expect(pickWeakArea(deriveKnowledgeMap(tree, rows, old, [], today, config), old, today, config)).toBeNull();
    expect(pickWeakArea(deriveKnowledgeMap(tree, [], [], [], today, config), [], today, config)).toBeNull();
  });

  it('never picks a parent node', () => {
    const concepts = [makeConcept({ slug: 'p' }), makeConcept({ slug: 'p.a', parentSlug: 'p' })];
    const rows = [makeMastery({ conceptId: 'p', overall: 30 }), makeMastery({ conceptId: 'p.a', overall: 35 })];
    const attempts = [makeAttempt({ conceptId: 'p' }), makeAttempt({ conceptId: 'p.a' })];
    expect(pickWeakArea(deriveKnowledgeMap(concepts, rows, attempts, [], today, config), attempts, today, config)?.slug).toBe('p.a');
  });
});
