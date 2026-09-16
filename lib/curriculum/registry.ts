// The registry shape data/curriculum/index.ts exports and every loader / integrity check / sync consumer reads.
// Lives apart from index.ts so data/**, sync.ts and integrity.ts can import the type without touching the default
// curriculum instance (index.ts imports data/curriculum; a value-level cycle would be a real one, this is only a type).
// Relative `.ts` specifiers only: data/** and scripts/** import this under plain node type stripping.
import type { RuleSet } from '../simulations/rule-set.ts';
import type { Release, Source } from '../sources/types.ts';
import type { Concept, Lesson, Mission, WeeklyBossTemplate, World } from './schema.ts';

/** Explicit imports build it (no fs globbing: scripts run under plain node). */
export interface Registry {
  WORLDS: readonly World[];
  MISSIONS: readonly Mission[];
  LESSONS: readonly Lesson[];
  CONCEPTS: readonly Concept[];
  SOURCES: readonly Source[];
  RELEASES: readonly Release[];
  WEEKLY_TEMPLATES: readonly WeeklyBossTemplate[];
  RULE_SETS: readonly RuleSet<unknown>[];
}
