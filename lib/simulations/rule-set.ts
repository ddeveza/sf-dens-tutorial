// SimId is the single source: StepPayload.simulator, LessonSchema.simulation.id and the /lab/[sim] param import it.
import type { ReleaseId, Verification } from '../sources/types.ts';

export const SIM_IDS = ['governor-limits', 'order-of-execution', 'sharing', 'soql-selectivity'] as const;
export type SimId = (typeof SIM_IDS)[number];

export type RuleSetId = `${SimId}@${string}`; // e.g. 'governor-limits@winter-27'

export interface RuleSet<TRules> {
  id: RuleSetId;
  simulation: SimId;
  release: ReleaseId; // data/releases.ts id
  apiVersion: string;
  sourceIds: string[]; // must exist in lib/sources registry
  verification: Verification; // same shape as LessonSchema.verification
  rules: TRules;
}

export interface RuleSetRegistry<TRules> {
  current: RuleSet<TRules>;
  history: RuleSet<TRules>[]; // older sets kept so lessons that pin them still resolve
}

export function isSimId(value: string): value is SimId {
  return (SIM_IDS as readonly string[]).includes(value);
}
