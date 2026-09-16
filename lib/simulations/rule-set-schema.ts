import { z } from 'zod';
import { SIM_IDS } from './rule-set.ts';
import { ReleaseIdSchema, VerificationSchema } from '../sources/schema.ts';

// Every simulator builds its own RuleSetSchema as ruleSetSchema(<sim>, <RulesSchema>) so rule-set files under
// data/simulations/<sim>/<release>.ts are validated on import and by rule-sets.test.ts.
export function ruleSetSchema<TRules extends z.ZodTypeAny>(simulation: (typeof SIM_IDS)[number], rules: TRules) {
  return z
    .object({
      id: z.string().regex(new RegExp(`^${simulation}@(spring|summer|winter)-\\d{2}$`)),
      simulation: z.literal(simulation),
      release: ReleaseIdSchema,
      apiVersion: z.string().regex(/^\d{2,3}\.0$/),
      sourceIds: z.array(z.string()).min(1),
      verification: VerificationSchema,
      rules,
    })
    .strict()
    .refine((r) => r.id === `${r.simulation}@${r.release}`, { message: 'id must equal `${simulation}@${release}`', path: ['id'] });
}
