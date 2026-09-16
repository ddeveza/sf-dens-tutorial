// The curriculum registry (ARCHITECTURE.md §B data layout: `curriculum/index.ts`): WORLDS, MISSIONS, LESSONS,
// CONCEPTS, SOURCES, RELEASES, WEEKLY_TEMPLATES, RULE_SETS as explicit imports (no fs globbing: scripts run this
// under plain node). lib/curriculum/index.ts builds the default Curriculum over REGISTRY; scripts/sync-curriculum.ts
// derives registry rows from it; curriculum.test.ts runs the seven integrity checks over it.
//
// LESSONS is empty on purpose: lessons (data/lessons/<world>/d<ddd>-<name>.ts) are the next phase. Every check that
// can run without lessons already runs over what is here.
import type { Registry } from '../../lib/curriculum/registry.ts';
import type { Concept, Lesson, Mission, WeeklyBossTemplate, World } from '../../lib/curriculum/schema.ts';
import type { RuleSet } from '../../lib/simulations/rule-set.ts';
import type { Release, Source } from '../../lib/sources/types.ts';
import { TEN_RECORD_DEPLOY } from '../challenges/weekly/w1-platform/ten-record-deploy.ts';
import { THURSDAY_CHANGE_SET } from '../challenges/weekly/w1-platform/thursday-change-set.ts';
import { W1_CONCEPTS } from '../concepts/w1-platform/index.ts';
import { RELEASES } from '../releases.ts';
import { registry as governorLimits } from '../simulations/governor-limits/index.ts';
import { registry as orderOfExecution } from '../simulations/order-of-execution/index.ts';
import { registry as sharing } from '../simulations/sharing/index.ts';
import { registry as soqlSelectivity } from '../simulations/soql-selectivity/index.ts';
import { SOURCES, resolveSourceId } from '../sources/index.ts';
import { MISSIONS } from './missions.ts';
import { WORLDS } from './worlds.ts';

export { RELEASES, SOURCES, MISSIONS, WORLDS };

export const LESSONS: readonly Lesson[] = [];

export const CONCEPTS: readonly Concept[] = [...W1_CONCEPTS];

export const WEEKLY_TEMPLATES: readonly WeeklyBossTemplate[] = [TEN_RECORD_DEPLOY, THURSDAY_CHANGE_SET];

/**
 * Rule sets cite sources by the raw ARCHITECTURE ids (`pdf-ldv`, `kb-custom-index`, ...); the registry resolves them
 * to canonical ids (data/sources/aliases.ts) so `RULE_SETS[].sourceIds` all exist in SOURCES. Rule-set files are
 * owned by the simulations slice and are not rewritten here.
 */
function canonicalSourceIds(ruleSet: RuleSet<unknown>): RuleSet<unknown> {
  return { ...ruleSet, sourceIds: ruleSet.sourceIds.map(resolveSourceId) };
}

const ALL_RULE_SETS: readonly RuleSet<unknown>[] = [
  governorLimits.current,
  ...governorLimits.history,
  orderOfExecution.current,
  ...orderOfExecution.history,
  sharing.current,
  ...sharing.history,
  soqlSelectivity.current,
  ...soqlSelectivity.history,
];

export const RULE_SETS: readonly RuleSet<unknown>[] = ALL_RULE_SETS.map(canonicalSourceIds);

export const REGISTRY: Registry = { WORLDS, MISSIONS, LESSONS, CONCEPTS, SOURCES, RELEASES, WEEKLY_TEMPLATES, RULE_SETS };

// Re-exported types so data consumers (scripts) can name registry members without reaching into lib/.
export type { Concept, Lesson, Mission, Release, Source, WeeklyBossTemplate, World };
