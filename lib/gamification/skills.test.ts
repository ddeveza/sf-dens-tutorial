import { describe, expect, it } from 'vitest';
import { GAMIFICATION_CONFIG } from './config.ts';
import { deriveSkillBars } from './skills.ts';
import { makeConcept, makeMastery } from './testing.ts';
import { SKILL_IDS, SKILL_LABELS } from './types.ts';

const config = GAMIFICATION_CONFIG;

describe('deriveSkillBars', () => {
  it('always returns the six bars in SKILL_IDS order with labels, zero when nothing is registered', () => {
    const bars = deriveSkillBars([], [], config);
    expect(bars.map((b) => b.id)).toEqual([...SKILL_IDS]);
    expect(bars.map((b) => b.label)).toEqual(SKILL_IDS.map((id) => SKILL_LABELS[id]));
    expect(bars.every((b) => b.pct === 0 && b.coveragePct === 0 && b.explored === 0 && b.total === 0)).toBe(true);
  });

  it('counts unexplored concepts as 0 in the denominator: 13 of 24 at 80 -> 43%', () => {
    const concepts = Array.from({ length: 24 }, (_, i) => makeConcept({ slug: `int-${i}`, skills: { integration: 1 } }));
    const masteries = concepts.slice(0, 13).map((c) => makeMastery({ conceptId: c.slug, overall: 80 }));
    const bar = deriveSkillBars(concepts, masteries, config).find((b) => b.id === 'integration');
    expect(bar).toEqual({ id: 'integration', label: 'Integration', pct: 43, coveragePct: 54, explored: 13, total: 24 });
  });

  it('cannot show 90% after one lesson', () => {
    const concepts = Array.from({ length: 10 }, (_, i) => makeConcept({ slug: `sec-${i}`, skills: { security: 1 } }));
    const bar = deriveSkillBars(concepts, [makeMastery({ conceptId: 'sec-0', overall: 95 })], config).find((b) => b.id === 'security');
    expect(bar?.pct).toBe(10);
    expect(bar?.coveragePct).toBe(10);
  });

  it('splits weight across skills exactly as the concept declares', () => {
    const concepts = [
      makeConcept({ slug: 'bulk-dml', skills: { apex: 0.6, data: 0.4 } }),
      makeConcept({ slug: 'indexes', skills: { data: 1 } }),
    ];
    const masteries = [makeMastery({ conceptId: 'bulk-dml', overall: 100 }), makeMastery({ conceptId: 'indexes', overall: 50 })];
    const bars = deriveSkillBars(concepts, masteries, config);
    const apex = bars.find((b) => b.id === 'apex');
    const data = bars.find((b) => b.id === 'data');
    expect(apex).toMatchObject({ pct: 100, explored: 1, total: 1 });
    // data: (0.4 x 100 + 1 x 50) / (0.4 + 1) = 90 / 1.4 = 64.29 -> 64
    expect(data).toMatchObject({ pct: 64, explored: 2, total: 2, coveragePct: 100 });
  });

  it('weights by concept importance', () => {
    const concepts = [
      makeConcept({ slug: 'big', skills: { platform: 1 }, importance: 3 }),
      makeConcept({ slug: 'small', skills: { platform: 1 }, importance: 1 }),
    ];
    const masteries = [makeMastery({ conceptId: 'big', overall: 80 }), makeMastery({ conceptId: 'small', overall: 0 })];
    const bar = deriveSkillBars(concepts, masteries, config).find((b) => b.id === 'platform');
    expect(bar?.pct).toBe(60); // (3 x 80 + 1 x 0) / 4
  });

  it('uses skills.unexploredValue for concepts without a mastery row', () => {
    const custom = { ...config, skills: { unexploredValue: 50 } };
    const concepts = [makeConcept({ slug: 'a', skills: { platform: 1 } }), makeConcept({ slug: 'b', skills: { platform: 1 } })];
    const bar = deriveSkillBars(concepts, [makeMastery({ conceptId: 'a', overall: 100 })], custom).find((b) => b.id === 'platform');
    expect(bar).toMatchObject({ pct: 75, explored: 1, total: 2 });
  });

  it('ignores mastery rows for concepts that are not registered', () => {
    const bar = deriveSkillBars([makeConcept({ slug: 'a' })], [makeMastery({ conceptId: 'ghost', overall: 100 })], config).find(
      (b) => b.id === 'platform',
    );
    expect(bar).toMatchObject({ pct: 0, explored: 0, total: 1 });
  });
});
