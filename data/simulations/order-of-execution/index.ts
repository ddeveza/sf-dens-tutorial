// Order-of-execution rule-set registry: `current` is what a lesson gets by default, `history` keeps older sets so
// a lesson that pins an old id still resolves. The step list has not moved since Spring '26; a release that changes
// it adds a new <release-id>.ts file and moves `current`.
import type { OoERules } from '../../../lib/simulations/order-of-execution/index.ts';
import type { RuleSet, RuleSetRegistry } from '../../../lib/simulations/rule-set.ts';
import { summer26 } from './summer-26.ts';

export const current: RuleSet<OoERules> = summer26;
export const history: RuleSet<OoERules>[] = [];

export const registry: RuleSetRegistry<OoERules> = { current, history };
