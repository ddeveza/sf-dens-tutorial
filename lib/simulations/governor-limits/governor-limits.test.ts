import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config.ts';
import type { RuleSet } from '../rule-set.ts';
import {
  GOVERNOR_CONTEXTS,
  GovernorInputSchema,
  GovernorRuleSetSchema,
  GovernorRulesSchema,
  LIMIT_KEYS,
  simulate,
} from './index.ts';
import type { GovernorContext, GovernorInput, GovernorRules, LimitKey } from './index.ts';

const MB = 1024 * 1024;

// Fixture rule set: realistic shape, small enough to reason about by hand. Real numbers live in data/simulations.
const syncRow: Record<LimitKey, number> = {
  soqlQueries: 100,
  soqlRows: 50_000,
  dmlStatements: 150,
  dmlRows: 10_000,
  callouts: 100,
  cpuMs: 10_000,
  heapBytes: 6 * MB,
  futureCalls: 50,
  queueableJobs: 50,
  emailInvocations: 10,
  soslQueries: 20,
};
const asyncRow: Record<LimitKey, number> = {
  ...syncRow,
  soqlQueries: 200,
  cpuMs: 60_000,
  heapBytes: 12 * MB,
  futureCalls: 0,
  queueableJobs: 1,
};

const rules: GovernorRules = {
  limits: {
    sync: syncRow,
    future: asyncRow,
    batch: asyncRow,
    queueable: { ...asyncRow, futureCalls: 1 },
    scheduled: { ...syncRow, queueableJobs: 1 },
  },
  triggerChunkSize: 200,
  uncatchable: true,
};

const ruleSet: RuleSet<GovernorRules> = {
  id: 'governor-limits@summer-26',
  simulation: 'governor-limits',
  release: 'summer-26',
  apiVersion: '67.0',
  sourceIds: ['dev-apex-gov-limits-262'],
  verification: { release: 'summer-26', apiVersion: '67.0', docVersion: 'test', lastVerified: '2026-09-04', status: 'verified' },
  rules,
};

function input(context: GovernorContext, ops: GovernorInput['ops']): GovernorInput {
  return { context, ops };
}

describe('governor-limits simulate', () => {
  it('a loop multiplies amount: 1 SOQL x 200 iterations breaches at iteration 101 with a Salesforce-style message', () => {
    const result = simulate(input('sync', [{ id: 'soql-in-loop', kind: 'soqlQueries', amount: 1, loop: { iterations: 200 } }]), ruleSet);
    expect(result.firstBreach).toEqual({
      opId: 'soql-in-loop',
      limit: 'soqlQueries',
      atIteration: 101,
      message: 'Too many SOQL queries: 101',
    });
    expect(result.usage.soqlQueries).toEqual({ used: 101, limit: 100, pct: 101 });
    expect(result.executed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.advice).toEqual(['bulkify_soql']);
  });

  it('one transaction shares one pool: two triggers accumulate and the breach lands on the second op', () => {
    const result = simulate(
      input('sync', [
        { id: 'trigger-a', kind: 'soqlQueries', amount: 1, loop: { iterations: 60 } },
        { id: 'trigger-b', kind: 'soqlQueries', amount: 1, loop: { iterations: 50 } },
        { id: 'after-dml', kind: 'dmlStatements', amount: 1 },
      ]),
      ruleSet,
    );
    expect(result.firstBreach).toMatchObject({ opId: 'trigger-b', limit: 'soqlQueries', atIteration: 41 });
    expect(result.usage.soqlQueries.used).toBe(101);
    expect(result.executed).toEqual(['trigger-a']);
    expect(result.skipped).toEqual(['after-dml']);
    expect(result.usage.dmlStatements.used).toBe(0);
  });

  it('the first breach stops execution: the breaching op is neither executed nor skipped, everything after it is skipped', () => {
    const result = simulate(
      input('sync', [
        { id: 'ok', kind: 'dmlStatements', amount: 10 },
        { id: 'boom', kind: 'callouts', amount: 101 },
        { id: 'never-1', kind: 'soqlQueries', amount: 1 },
        { id: 'never-2', kind: 'heapBytes', amount: 100 * MB },
      ]),
      ruleSet,
    );
    expect(result.firstBreach?.opId).toBe('boom');
    expect(result.executed).toEqual(['ok']);
    expect(result.skipped).toEqual(['never-1', 'never-2']);
    expect(result.usage.heapBytes.used).toBe(0);
    expect(result.usage.soqlQueries.used).toBe(0);
  });

  it('limits are picked by context: 150 SOQL breaches synchronously but fits in a future method', () => {
    const ops: GovernorInput['ops'] = [{ id: 'loop', kind: 'soqlQueries', amount: 1, loop: { iterations: 150 } }];
    const sync = simulate(input('sync', ops), ruleSet);
    const future = simulate(input('future', ops), ruleSet);
    expect(sync.firstBreach?.atIteration).toBe(101);
    expect(future.firstBreach).toBeUndefined();
    expect(future.usage.soqlQueries).toEqual({ used: 150, limit: 200, pct: 75 });
    expect(future.executed).toEqual(['loop']);
  });

  it('a zero limit breaches on the first use (future call from a batch context)', () => {
    const result = simulate(input('batch', [{ id: 'fan-out', kind: 'futureCalls', amount: 1 }]), ruleSet);
    expect(result.firstBreach).toEqual({ opId: 'fan-out', limit: 'futureCalls', atIteration: 1, message: 'Too many future calls: 1' });
    expect(result.usage.futureCalls).toEqual({ used: 1, limit: 0, pct: 100 });
    expect(result.advice).toEqual(['use_batch']);
  });

  it('no breach: every op executes, usage carries integer pct, advice is empty', () => {
    const result = simulate(
      input('sync', [
        { id: 'q', kind: 'soqlQueries', amount: 1 },
        { id: 'rows', kind: 'soqlRows', amount: 200 },
        { id: 'dml', kind: 'dmlStatements', amount: 1 },
        { id: 'dml-rows', kind: 'dmlRows', amount: 200 },
      ]),
      ruleSet,
    );
    expect(result.firstBreach).toBeUndefined();
    expect(result.executed).toEqual(['q', 'rows', 'dml', 'dml-rows']);
    expect(result.skipped).toEqual([]);
    expect(result.advice).toEqual([]);
    expect(result.usage.soqlQueries).toEqual({ used: 1, limit: 100, pct: 1 });
    expect(result.usage.soqlRows).toEqual({ used: 200, limit: 50_000, pct: 0 });
    expect(result.usage.dmlRows).toEqual({ used: 200, limit: 10_000, pct: 2 });
    expect(result.usage.futureCalls).toEqual({ used: 0, limit: 50, pct: 0 });
    expect(Object.keys(result.usage).sort()).toEqual([...LIMIT_KEYS].sort());
  });

  it('an unused zero limit reports pct 0, and amount 0 never breaches', () => {
    const result = simulate(input('batch', [{ id: 'noop', kind: 'futureCalls', amount: 0, loop: { iterations: 500 } }]), ruleSet);
    expect(result.firstBreach).toBeUndefined();
    expect(result.usage.futureCalls).toEqual({ used: 0, limit: 0, pct: 0 });
    expect(result.executed).toEqual(['noop']);
  });

  it('heap: the breach message carries the byte count and a single op breaches at iteration 1', () => {
    const result = simulate(input('sync', [{ id: 'big-string', kind: 'heapBytes', amount: 9 * MB }]), ruleSet);
    expect(result.firstBreach).toEqual({
      opId: 'big-string',
      limit: 'heapBytes',
      atIteration: 1,
      message: `Apex heap size too large: ${9 * MB}`,
    });
    expect(result.usage.heapBytes.pct).toBe(150);
  });

  it.each<[LimitKey, string]>([
    ['soqlQueries', 'Too many SOQL queries: 101'],
    ['soqlRows', 'Too many query rows: 50001'],
    ['dmlStatements', 'Too many DML statements: 151'],
    ['dmlRows', 'Too many DML rows: 10001'],
    ['callouts', 'Too many callouts: 101'],
    ['cpuMs', 'Apex CPU time limit exceeded'],
    ['futureCalls', 'Too many future calls: 51'],
    ['queueableJobs', 'Too many queueable jobs added to the queue: 51'],
    ['emailInvocations', 'Too many Email Invocations: 11'],
    ['soslQueries', 'Too many SOSL queries: 21'],
  ])('message for %s is Salesforce-style', (kind, message) => {
    const result = simulate(input('sync', [{ id: 'op', kind, amount: 1, loop: { iterations: syncRow[kind] + 1 } }]), ruleSet);
    expect(result.firstBreach?.message).toBe(message);
    expect(result.firstBreach?.atIteration).toBe(syncRow[kind] + 1);
  });

  describe('advice derives from the broken limit, the loop and the context', () => {
    it('SOQL inside a loop => bulkify_soql; SOQL rows in one query => use_batch', () => {
      const loop = simulate(input('sync', [{ id: 'a', kind: 'soqlQueries', amount: 1, loop: { iterations: 101 } }]), ruleSet);
      const single = simulate(input('sync', [{ id: 'a', kind: 'soqlRows', amount: 60_000 }]), ruleSet);
      expect(loop.advice).toEqual(['bulkify_soql']);
      expect(single.advice).toEqual(['use_batch']);
    });

    it('DML statements => collect_dml whether or not in a loop; DML rows => use_batch', () => {
      const loop = simulate(input('sync', [{ id: 'a', kind: 'dmlStatements', amount: 1, loop: { iterations: 151 } }]), ruleSet);
      const single = simulate(input('sync', [{ id: 'a', kind: 'dmlStatements', amount: 151 }]), ruleSet);
      const rows = simulate(input('sync', [{ id: 'a', kind: 'dmlRows', amount: 10_001 }]), ruleSet);
      expect(loop.advice).toEqual(['collect_dml']);
      expect(single.advice).toEqual(['collect_dml']);
      expect(rows.advice).toEqual(['use_batch']);
    });

    it('callouts => move_callouts_async synchronously, use_batch when already async', () => {
      const ops: GovernorInput['ops'] = [{ id: 'a', kind: 'callouts', amount: 1, loop: { iterations: 101 } }];
      expect(simulate(input('sync', ops), ruleSet).advice).toEqual(['move_callouts_async']);
      expect(simulate(input('queueable', ops), ruleSet).advice).toEqual(['use_batch']);
    });

    it('heap => reduce_heap, plus use_batch synchronously because async heap is larger', () => {
      const ops: GovernorInput['ops'] = [{ id: 'a', kind: 'heapBytes', amount: 30 * MB }];
      expect(simulate(input('sync', ops), ruleSet).advice).toEqual(['reduce_heap', 'use_batch']);
      expect(simulate(input('batch', ops), ruleSet).advice).toEqual(['reduce_heap']);
    });

    it('CPU, futures, queueables, email and SOSL outside a loop => use_batch', () => {
      expect(simulate(input('sync', [{ id: 'a', kind: 'cpuMs', amount: 20_000 }]), ruleSet).advice).toEqual(['use_batch']);
      expect(simulate(input('sync', [{ id: 'a', kind: 'futureCalls', amount: 51 }]), ruleSet).advice).toEqual(['use_batch']);
      expect(simulate(input('future', [{ id: 'a', kind: 'queueableJobs', amount: 2 }]), ruleSet).advice).toEqual(['use_batch']);
      expect(simulate(input('sync', [{ id: 'a', kind: 'emailInvocations', amount: 11 }]), ruleSet).advice).toEqual(['use_batch']);
      expect(simulate(input('sync', [{ id: 'a', kind: 'soslQueries', amount: 21 }]), ruleSet).advice).toEqual(['use_batch']);
    });

    it('SOSL inside a loop => bulkify_soql', () => {
      const result = simulate(input('sync', [{ id: 'a', kind: 'soslQueries', amount: 1, loop: { iterations: 21 } }]), ruleSet);
      expect(result.advice).toEqual(['bulkify_soql']);
    });
  });

  it('is pure: the same input yields an equal result and the input is not mutated', () => {
    const ops: GovernorInput['ops'] = [{ id: 'x', kind: 'soqlQueries', amount: 1, loop: { iterations: 120 } }];
    const snapshot = JSON.stringify(ops);
    const a = simulate(input('sync', ops), ruleSet);
    const b = simulate(input('sync', ops), ruleSet);
    expect(a).toEqual(b);
    expect(JSON.stringify(ops)).toBe(snapshot);
  });
});

describe('governor-limits schemas', () => {
  it('GovernorRulesSchema accepts the fixture and requires every context row and every limit key', () => {
    expect(GovernorRulesSchema.safeParse(rules).success).toBe(true);
    const without = (record: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
    expect(GovernorRulesSchema.safeParse({ ...rules, limits: without(rules.limits, 'scheduled') }).success).toBe(false);
    expect(GovernorRulesSchema.safeParse({ ...rules, limits: { ...rules.limits, sync: without(syncRow, 'soslQueries') } }).success).toBe(false);
  });

  it('GovernorRulesSchema rejects uncatchable !== true, unknown keys and negative limits', () => {
    expect(GovernorRulesSchema.safeParse({ ...rules, uncatchable: false }).success).toBe(false);
    expect(GovernorRulesSchema.safeParse({ ...rules, extra: 1 }).success).toBe(false);
    expect(GovernorRulesSchema.safeParse({ ...rules, limits: { ...rules.limits, sync: { ...syncRow, soqlQueries: -1 } } }).success).toBe(false);
    expect(GovernorRulesSchema.safeParse({ ...rules, notes: { heapBytes: 'release-based rollout' } }).success).toBe(true);
    expect(GovernorRulesSchema.safeParse({ ...rules, notes: { notALimit: 'x' } }).success).toBe(false);
  });

  it('GovernorRuleSetSchema validates the whole rule set and pins simulation/id/release together', () => {
    expect(GovernorRuleSetSchema.safeParse(ruleSet).success).toBe(true);
    expect(GovernorRuleSetSchema.safeParse({ ...ruleSet, id: 'governor-limits@winter-27' }).success).toBe(false);
    expect(GovernorRuleSetSchema.safeParse({ ...ruleSet, simulation: 'sharing' }).success).toBe(false);
  });

  it('GovernorInputSchema enforces the SIM_CONFIG loop range and op cap, and known kinds/contexts', () => {
    const { min, max } = SIM_CONFIG.governor.loopIterations;
    const ok = { context: 'sync', ops: [{ id: 'a', kind: 'soqlQueries', amount: 1, loop: { iterations: max } }] };
    expect(GovernorInputSchema.safeParse(ok).success).toBe(true);
    expect(GovernorInputSchema.safeParse({ ...ok, ops: [{ ...ok.ops[0], loop: { iterations: max + 1 } }] }).success).toBe(false);
    expect(GovernorInputSchema.safeParse({ ...ok, ops: [{ ...ok.ops[0], loop: { iterations: min - 1 } }] }).success).toBe(false);
    expect(GovernorInputSchema.safeParse({ ...ok, ops: [{ ...ok.ops[0], kind: 'soqlQuery' }] }).success).toBe(false);
    expect(GovernorInputSchema.safeParse({ ...ok, context: 'async' }).success).toBe(false);
    expect(GovernorInputSchema.safeParse({ ...ok, ops: [{ ...ok.ops[0], amount: -1 }] }).success).toBe(false);
    const tooMany = { context: 'sync', ops: Array.from({ length: SIM_CONFIG.governor.maxOpsPerTransaction + 1 }, (_, i) => ({ id: `op-${i}`, kind: 'soqlQueries', amount: 1 })) };
    expect(GovernorInputSchema.safeParse(tooMany).success).toBe(false);
    expect(GovernorInputSchema.safeParse({ context: 'sync', ops: [] }).success).toBe(true);
    expect(GovernorInputSchema.safeParse({ context: 'sync', ops: [{ id: 'a', kind: 'soqlQueries', amount: 1 }, { id: 'a', kind: 'dmlRows', amount: 1 }] }).success).toBe(false);
  });

  it('exports the canonical key and context lists', () => {
    expect(LIMIT_KEYS).toHaveLength(11);
    expect(GOVERNOR_CONTEXTS).toEqual(['sync', 'future', 'batch', 'queueable', 'scheduled']);
  });
});
