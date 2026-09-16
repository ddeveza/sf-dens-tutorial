// Governor Limit Simulator (ARCHITECTURE.md, Simulations). Pure: plain objects in and out, no IO, no env, no clock.
// Rule numbers never live here: they come from the RuleSet the page passes (data/simulations/governor-limits/<release>.ts).
import { z } from 'zod';
import { SIM_CONFIG } from '../config.ts';
import type { RuleSet } from '../rule-set.ts';
import { ruleSetSchema } from '../rule-set-schema.ts';

export const LIMIT_KEYS = [
  'soqlQueries',
  'soqlRows',
  'dmlStatements',
  'dmlRows',
  'callouts',
  'cpuMs',
  'heapBytes',
  'futureCalls',
  'queueableJobs',
  'emailInvocations',
  'soslQueries',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

// Limits differ per async kind, not just sync/async (futures from batch: 0; enqueueJob from async: 1).
export const GOVERNOR_CONTEXTS = ['sync', 'future', 'batch', 'queueable', 'scheduled'] as const;
export type GovernorContext = (typeof GOVERNOR_CONTEXTS)[number];

export const GOVERNOR_ADVICE = ['bulkify_soql', 'collect_dml', 'move_callouts_async', 'use_batch', 'reduce_heap'] as const;
export type GovernorAdvice = (typeof GOVERNOR_ADVICE)[number];

export interface GovernorOp {
  id: string;
  kind: LimitKey;
  amount: number; // units of the limit: queries, rows, statements, ms, bytes, calls
  loop?: { iterations: number }; // multiplies amount; the breach reports the iteration it happened at
}

export interface GovernorInput {
  context: GovernorContext;
  ops: GovernorOp[]; // one transaction: every op shares one pool (triggers in the same transaction count together)
}

export interface GovernorRules {
  limits: Record<GovernorContext, Record<LimitKey, number>>;
  triggerChunkSize: number; // default loop iterations in the UI
  uncatchable: true; // LimitException cannot be caught: ops after the breach never run
  notes?: Partial<Record<LimitKey, string>>; // e.g. a limit that rolls out org-wide on upgrade rather than by API version
}

export interface GovernorUsage {
  used: number;
  limit: number;
  pct: number; // integer percent of the limit; 100 when a zero limit was touched
}

export interface GovernorBreach {
  opId: string;
  limit: LimitKey;
  atIteration: number; // 1-based iteration inside the op's loop; 1 for a plain op
  message: string; // Salesforce-style, e.g. "Too many SOQL queries: 101"
}

export interface GovernorResult {
  usage: Record<LimitKey, GovernorUsage>;
  firstBreach?: GovernorBreach;
  executed: string[]; // ops that completed before the breach (the breaching op is in firstBreach, not here)
  skipped: string[]; // ops after the breach never run (LimitException is uncatchable)
  advice: GovernorAdvice[];
}

// ---------- schemas ----------

const LimitRowSchema = z.record(z.enum(LIMIT_KEYS), z.number().int().nonnegative());

export const GovernorRulesSchema = z
  .object({
    limits: z.record(z.enum(GOVERNOR_CONTEXTS), LimitRowSchema),
    triggerChunkSize: z.number().int().positive(),
    uncatchable: z.literal(true),
    notes: z.partialRecord(z.enum(LIMIT_KEYS), z.string().min(1)).optional(),
  })
  .strict();

export const GovernorRuleSetSchema = ruleSetSchema('governor-limits', GovernorRulesSchema);

export const GovernorOpSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(LIMIT_KEYS),
    amount: z.number().int().nonnegative(),
    loop: z
      .object({
        iterations: z.number().int().min(SIM_CONFIG.governor.loopIterations.min).max(SIM_CONFIG.governor.loopIterations.max),
      })
      .strict()
      .optional(),
  })
  .strict();

export const GovernorInputSchema = z
  .object({
    context: z.enum(GOVERNOR_CONTEXTS),
    ops: z.array(GovernorOpSchema).max(SIM_CONFIG.governor.maxOpsPerTransaction),
  })
  .strict()
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.ops.forEach((op, index) => {
      if (seen.has(op.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate op id '${op.id}'`, path: ['ops', index, 'id'] });
      }
      seen.add(op.id);
    });
  });

// ---------- engine ----------

// Message shapes mirror the System.LimitException text learners will meet in debug logs.
function breachMessage(limit: LimitKey, used: number): string {
  switch (limit) {
    case 'soqlQueries':
      return `Too many SOQL queries: ${used}`;
    case 'soqlRows':
      return `Too many query rows: ${used}`;
    case 'dmlStatements':
      return `Too many DML statements: ${used}`;
    case 'dmlRows':
      return `Too many DML rows: ${used}`;
    case 'callouts':
      return `Too many callouts: ${used}`;
    case 'cpuMs':
      return 'Apex CPU time limit exceeded';
    case 'heapBytes':
      return `Apex heap size too large: ${used}`;
    case 'futureCalls':
      return `Too many future calls: ${used}`;
    case 'queueableJobs':
      return `Too many queueable jobs added to the queue: ${used}`;
    case 'emailInvocations':
      return `Too many Email Invocations: ${used}`;
    case 'soslQueries':
      return `Too many SOSL queries: ${used}`;
  }
}

// Advice is derived from which limit broke, whether the offending op sat inside a loop, and the context.
function deriveAdvice(limit: LimitKey, inLoop: boolean, context: GovernorContext): GovernorAdvice[] {
  const isSync = context === 'sync';
  switch (limit) {
    case 'soqlQueries':
    case 'soqlRows':
    case 'soslQueries':
      return inLoop ? ['bulkify_soql'] : ['use_batch'];
    case 'dmlStatements':
      return ['collect_dml'];
    case 'dmlRows':
      return ['use_batch'];
    case 'callouts':
      return isSync ? ['move_callouts_async'] : ['use_batch'];
    case 'heapBytes':
      return isSync ? ['reduce_heap', 'use_batch'] : ['reduce_heap'];
    case 'cpuMs':
    case 'futureCalls':
    case 'queueableJobs':
    case 'emailInvocations':
      return ['use_batch'];
  }
}

function percent(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.round((used / limit) * 100);
}

function emptyCounters(): Record<LimitKey, number> {
  const counters = {} as Record<LimitKey, number>;
  for (const key of LIMIT_KEYS) counters[key] = 0;
  return counters;
}

export function simulate(input: GovernorInput, ruleSet: RuleSet<GovernorRules>): GovernorResult {
  const limits = ruleSet.rules.limits[input.context];
  const used = emptyCounters();
  const executed: string[] = [];
  const skipped: string[] = [];
  let firstBreach: GovernorBreach | undefined;
  let breachedInLoop = false;

  for (const op of input.ops) {
    if (firstBreach) {
      skipped.push(op.id);
      continue;
    }
    const iterations = op.loop ? op.loop.iterations : 1;
    const limit = limits[op.kind];
    if (op.amount > 0) {
      for (let iteration = 1; iteration <= iterations; iteration++) {
        used[op.kind] += op.amount;
        if (used[op.kind] > limit) {
          firstBreach = { opId: op.id, limit: op.kind, atIteration: iteration, message: breachMessage(op.kind, used[op.kind]) };
          breachedInLoop = op.loop !== undefined;
          break;
        }
      }
    }
    if (!firstBreach) executed.push(op.id);
  }

  const usage = {} as Record<LimitKey, GovernorUsage>;
  for (const key of LIMIT_KEYS) {
    usage[key] = { used: used[key], limit: limits[key], pct: percent(used[key], limits[key]) };
  }

  // Keys in declared order so regenerated goldens diff cleanly; firstBreach is absent (not undefined) without a breach.
  return {
    usage,
    ...(firstBreach ? { firstBreach } : {}),
    executed,
    skipped,
    advice: firstBreach ? deriveAdvice(firstBreach.limit, breachedInLoop, input.context) : [],
  };
}
