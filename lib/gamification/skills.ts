// Six skill bars: skillPct(s) = sum_c weight(c,s) x importance(c) x overall(c) / sum_c weight(c,s) x importance(c),
// with the denominator over every registered concept for the skill (unexplored concepts vote at unexploredValue).
import type { GamificationConfig } from './config.ts';
import type { ConceptRow, MasteryRow } from './context.ts';
import { SKILL_IDS, SKILL_LABELS, type SkillBar } from './types.ts';

export function deriveSkillBars(concepts: readonly ConceptRow[], masteries: readonly MasteryRow[], config: GamificationConfig): SkillBar[] {
  const overallByConcept = new Map(masteries.map((m) => [m.conceptId, m.overall]));
  return SKILL_IDS.map((id) => {
    let numerator = 0;
    let denominator = 0;
    let explored = 0;
    let total = 0;
    for (const c of concepts) {
      const weight = c.skills[id] ?? 0;
      if (weight <= 0) continue;
      total += 1;
      const w = weight * c.importance;
      const overall = overallByConcept.get(c.slug);
      if (overall !== undefined) explored += 1;
      numerator += w * (overall ?? config.skills.unexploredValue);
      denominator += w;
    }
    return {
      id,
      label: SKILL_LABELS[id],
      pct: denominator > 0 ? Math.round(numerator / denominator) : 0,
      coveragePct: total > 0 ? Math.round((explored / total) * 100) : 0,
      explored,
      total,
    };
  });
}
