// Governor-limit rule-set registry: `current` is what a lesson gets by default, `history` keeps every older set so a
// lesson that pins an old id still resolves and renders its "rules as of <Release.name>" badge. A Salesforce release
// that changes a number adds a new <release-id>.ts file and moves `current`; nothing is ever edited in place.
import type { GovernorRules } from '../../../lib/simulations/governor-limits/index.ts';
import type { RuleSet, RuleSetRegistry } from '../../../lib/simulations/rule-set.ts';
import { summer26 } from './summer-26.ts';
import { winter27 } from './winter-27.ts';

export const current: RuleSet<GovernorRules> = winter27;
export const history: RuleSet<GovernorRules>[] = [summer26];

export const registry: RuleSetRegistry<GovernorRules> = { current, history };
