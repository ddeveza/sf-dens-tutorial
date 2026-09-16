// Weekly boss templates live in data/ (they carry an exercise body), not in the DB registry, so the gamification
// context takes them as an extra. This is the one mapping from the authored template to the row shape the boss
// board reads. Relative `.ts` specifiers: scripts may import it transitively under plain node.
import type { WeeklyTemplateRow } from '../gamification/context.ts';
import type { WeeklyBossTemplate } from './schema.ts';

export function toWeeklyTemplateRow(template: WeeklyBossTemplate): WeeklyTemplateRow {
  return { id: template.id, worldSlug: template.world, title: template.title, concepts: [...template.concepts] };
}

export function toWeeklyTemplateRows(templates: readonly WeeklyBossTemplate[]): WeeklyTemplateRow[] {
  return templates.map(toWeeklyTemplateRow);
}
