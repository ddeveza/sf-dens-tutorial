// SOQL Selectivity Simulator engine tests (ARCHITECTURE.md, Simulations > SOQL Selectivity Simulator). Table-driven,
// pure: the rule set is built here so the engine is tested independently of data/simulations/soql-selectivity.
import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config.ts';
import type { RuleSet } from '../rule-set.ts';
import { SelectivityInputSchema, SelectivityRuleSetSchema, SelectivityRulesSchema, selectivityThreshold, simulate } from './index.ts';
import type { SelectivityFilter, SelectivityInput, SelectivityRules } from './index.ts';

const rules: SelectivityRules = {
  thresholds: {
    standard: { firstMillionPct: 30, beyondPct: 15, maxRows: 1_000_000 },
    custom: { firstMillionPct: 10, beyondPct: 5, maxRows: 333_000 },
  },
  nonSelectiveOperators: [
    { operator: 'neq' },
    { operator: 'notIn' },
    { operator: 'notLike' },
    { operator: 'likeLeadingWildcard' },
    { operator: 'includes' },
    { operator: 'excludes' },
  ],
  nonIndexableFieldKinds: ['formula'],
  customIndexIncludesNulls: false,
};

function ruleSetWith(over: Partial<SelectivityRules> = {}): RuleSet<SelectivityRules> {
  return {
    id: 'soql-selectivity@summer-26',
    simulation: 'soql-selectivity',
    release: 'summer-26',
    apiVersion: '67.0',
    sourceIds: ['pdf-ldv'],
    verification: { release: 'summer-26', apiVersion: '67.0', docVersion: 'test', lastVerified: '2026-09-04', status: 'verified' },
    rules: { ...rules, ...over },
  };
}
const ruleSet = ruleSetWith();

function filter(over: Partial<SelectivityFilter> & { id: string }): SelectivityFilter {
  return { field: over.id, operator: 'eq', index: 'standard', matchingRows: 100, fieldKind: 'text', ...over };
}
function query(filters: SelectivityFilter[], totalRows = 1_000_000, combinator: 'AND' | 'OR' = 'AND'): SelectivityInput {
  return { totalRows, filters, combinator };
}

describe('selectivityThreshold', () => {
  it.each([
    ['standard, 1M rows: 30% of the first million', 1_000_000, 'standard', 300_000],
    ['custom, 1M rows: 10% of the first million', 1_000_000, 'custom', 100_000],
    ['standard, 5M rows: 300k + 15% of 4M', 5_000_000, 'standard', 900_000],
    ['custom, 5M rows: 100k + 5% of 4M', 5_000_000, 'custom', 300_000],
    ['standard, 10M rows: 1.65M capped at 1M', 10_000_000, 'standard', 1_000_000],
    ['custom, 10M rows: 550k capped at 333k', 10_000_000, 'custom', 333_000],
    ['standard, 500k rows: 30% of 500k', 500_000, 'standard', 150_000],
    ['custom, 1,000 rows: 10% of 1,000', 1_000, 'custom', 100],
    ['fractions floor: standard on 1,001 rows', 1_001, 'standard', 300],
  ] as const)('%s', (_label, totalRows, index, expected) => {
    expect(selectivityThreshold(totalRows, rules.thresholds[index])).toBe(expected);
  });
});

describe('single-filter verdicts', () => {
  it('a standard-indexed equality within the threshold drives the query', () => {
    const result = simulate(query([filter({ id: 'Email', matchingRows: 100 })]), ruleSet);
    expect(result).toMatchObject({ selective: true, plan: 'index', suggestions: [] });
    expect(result.perFilter).toEqual([{ id: 'Email', usable: true, threshold: 300_000, matchingRows: 100, reason: expect.stringContaining('within the 300,000 threshold') }]);
  });

  it('5M rows with a custom-indexed Status__c matching 400,000 rows is NOT selective (threshold 300,000)', () => {
    const result = simulate(query([filter({ id: 'Status__c', index: 'custom', fieldKind: 'picklist', matchingRows: 400_000 })], 5_000_000), ruleSet);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.perFilter[0]).toMatchObject({ usable: false, threshold: 300_000, matchingRows: 400_000 });
    expect(result.perFilter[0].reason).toContain('above the 300,000 threshold');
    expect(result.suggestions).toEqual(['add_selective_leading_filter', 'reduce_scope']);
  });

  it('exactly at the threshold is still usable', () => {
    const result = simulate(query([filter({ id: 'Status__c', index: 'custom', matchingRows: 300_000 })], 5_000_000), ruleSet);
    expect(result).toMatchObject({ selective: true, plan: 'index' });
  });

  it('the caps apply on very large objects', () => {
    expect(simulate(query([filter({ id: 'Ext__c', index: 'custom', matchingRows: 330_000 })], 10_000_000), ruleSet).selective).toBe(true);
    expect(simulate(query([filter({ id: 'Ext__c', index: 'custom', matchingRows: 340_000 })], 10_000_000), ruleSet).selective).toBe(false);
    expect(simulate(query([filter({ id: 'Name', index: 'standard', matchingRows: 1_000_000 })], 10_000_000), ruleSet).selective).toBe(true);
    expect(simulate(query([filter({ id: 'Name', index: 'standard', matchingRows: 1_000_001 })], 10_000_000), ruleSet).selective).toBe(false);
  });

  it('an unindexed field cannot drive the query and suggests a custom index', () => {
    const result = simulate(query([filter({ id: 'Region__c', index: 'none', matchingRows: 10 })]), ruleSet);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.perFilter[0]).toMatchObject({ usable: false, threshold: 0 });
    expect(result.perFilter[0].reason).toContain('no index');
    expect(result.suggestions).toEqual(['add_custom_index', 'add_selective_leading_filter']);
  });

  it.each(['neq', 'notIn', 'notLike', 'likeLeadingWildcard', 'includes', 'excludes'] as const)('operator %s is never selective even on an index', (operator) => {
    const result = simulate(query([filter({ id: 'Name', operator, matchingRows: 10 })]), ruleSet);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.perFilter[0]).toMatchObject({ usable: false, threshold: 300_000 });
    expect(result.perFilter[0].reason).toContain('never selective');
    expect(result.suggestions).toEqual(['replace_negative_operator', 'add_selective_leading_filter']);
  });

  it('LIKE without a leading wildcard, IN, > and < are usable on an index', () => {
    for (const operator of ['like', 'in', 'gt', 'lt'] as const) {
      expect(simulate(query([filter({ id: 'Name', operator, matchingRows: 10 })]), ruleSet).selective).toBe(true);
    }
  });

  it('fieldKinds scopes a non-selective operator to the listed kinds', () => {
    const scoped = ruleSetWith({ nonSelectiveOperators: [...rules.nonSelectiveOperators, { operator: 'gt', fieldKinds: ['text'] }] });
    const onText = simulate(query([filter({ id: 'Name', operator: 'gt', fieldKind: 'text', matchingRows: 10 })]), scoped);
    expect(onText.selective).toBe(false);
    expect(onText.perFilter[0].reason).toContain('on text fields');
    const onDate = simulate(query([filter({ id: 'CreatedDate', operator: 'gt', fieldKind: 'numberOrDate', matchingRows: 10 })]), scoped);
    expect(onDate.selective).toBe(true);
  });

  it('a formula field is not indexable, whatever index the input claims', () => {
    const result = simulate(query([filter({ id: 'Score__c', fieldKind: 'formula', index: 'custom', matchingRows: 100 })], 2_000_000), ruleSet);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.perFilter[0].reason).toContain('not indexable');
    expect(result.suggestions).toEqual(['add_selective_leading_filter', 'avoid_formula_filter']);
  });

  it('nonIndexableFieldKinds comes from the rule set', () => {
    const result = simulate(query([filter({ id: 'Score__c', fieldKind: 'formula', index: 'custom', matchingRows: 100 })]), ruleSetWith({ nonIndexableFieldKinds: [] }));
    expect(result.selective).toBe(true);
  });
});

describe('isNull', () => {
  it('= null cannot use a standard index: nulls are excluded from index tables', () => {
    const result = simulate(query([filter({ id: 'Email', operator: 'isNull', index: 'standard', matchingRows: 10 })]), ruleSet);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.perFilter[0].reason).toContain('nulls');
    expect(result.suggestions).toEqual(['add_custom_index', 'add_selective_leading_filter']);
  });

  it('= null on a custom index is unusable while customIndexIncludesNulls is false', () => {
    const result = simulate(query([filter({ id: 'External_Id__c', operator: 'isNull', index: 'custom', matchingRows: 10 })]), ruleSet);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.perFilter[0]).toMatchObject({ usable: false, threshold: 100_000 });
    expect(result.perFilter[0].reason).toContain('exclude nulls');
    expect(result.suggestions).toEqual(['add_custom_index', 'add_selective_leading_filter']);
  });

  it('= null on a custom index is usable when customIndexIncludesNulls is true, subject to the threshold', () => {
    const withNulls = ruleSetWith({ customIndexIncludesNulls: true });
    const ok = simulate(query([filter({ id: 'External_Id__c', operator: 'isNull', index: 'custom', matchingRows: 50_000 })]), withNulls);
    expect(ok).toMatchObject({ selective: true, plan: 'index' });
    expect(ok.perFilter[0].reason).toContain('includes nulls');
    const tooMany = simulate(query([filter({ id: 'External_Id__c', operator: 'isNull', index: 'custom', matchingRows: 150_000 })]), withNulls);
    expect(tooMany).toMatchObject({ selective: false, plan: 'fullScan' });
  });
});

describe('AND', () => {
  it('is selective when at least one filter is usable, and then makes no suggestions', () => {
    const result = simulate(
      query([filter({ id: 'Status__c', operator: 'neq', index: 'custom', fieldKind: 'picklist', matchingRows: 900_000 }), filter({ id: 'Email', matchingRows: 5_000 })], 2_000_000),
      ruleSet,
    );
    expect(result).toMatchObject({ selective: true, plan: 'index', suggestions: [] });
    expect(result.perFilter.map((f) => [f.id, f.usable])).toEqual([
      ['Status__c', false],
      ['Email', true],
    ]);
  });

  it('is a full scan when no filter is usable, and collects one suggestion per cause', () => {
    const result = simulate(
      query([
        filter({ id: 'Region__c', index: 'none', matchingRows: 10 }),
        filter({ id: 'Name', operator: 'likeLeadingWildcard', matchingRows: 10 }),
        filter({ id: 'Score__c', fieldKind: 'formula', index: 'none', matchingRows: 10 }),
        filter({ id: 'Status__c', index: 'custom', matchingRows: 500_000 }),
      ]),
      ruleSet,
    );
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.suggestions).toEqual(['add_custom_index', 'replace_negative_operator', 'add_selective_leading_filter', 'avoid_formula_filter', 'reduce_scope']);
  });
});

describe('OR', () => {
  it('is selective only when every branch is usable and the summed matches stay within the threshold', () => {
    const result = simulate(query([filter({ id: 'Email', matchingRows: 100_000 }), filter({ id: 'Name', operator: 'like', matchingRows: 150_000 })], 1_000_000, 'OR'), ruleSet);
    expect(result).toMatchObject({ selective: true, plan: 'index', suggestions: [] });
  });

  it('OR-sum over threshold: each branch is usable alone but the union is a full scan', () => {
    const result = simulate(query([filter({ id: 'Email', matchingRows: 200_000 }), filter({ id: 'Name', operator: 'like', matchingRows: 150_000 })], 1_000_000, 'OR'), ruleSet);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.perFilter.every((f) => f.usable)).toBe(true);
    expect(result.perFilter.every((f) => f.reason.includes('350,000 rows') && f.reason.includes('full scan'))).toBe(true);
    expect(result.suggestions).toEqual(['reduce_scope']);
  });

  it('one unindexed branch makes the whole OR a full scan', () => {
    const result = simulate(query([filter({ id: 'Id', operator: 'in', matchingRows: 10 }), filter({ id: 'Legacy__c', index: 'none', matchingRows: 10 })], 1_000_000, 'OR'), ruleSet);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan' });
    expect(result.perFilter.map((f) => f.usable)).toEqual([true, false]);
    expect(result.perFilter[0].reason).toContain("'Legacy__c'");
    expect(result.suggestions).toEqual(['add_custom_index', 'add_selective_leading_filter']);
  });

  it('with mixed index kinds the union is held to the tightest threshold', () => {
    const result = simulate(query([filter({ id: 'Email', matchingRows: 60_000 }), filter({ id: 'Ext__c', index: 'custom', matchingRows: 60_000 })], 1_000_000, 'OR'), ruleSet);
    expect(result.perFilter.every((f) => f.usable)).toBe(true);
    expect(result).toMatchObject({ selective: false, plan: 'fullScan', suggestions: ['reduce_scope'] });
    expect(result.perFilter[0].reason).toContain('above the 100,000 threshold');
  });
});

describe('purity and schemas', () => {
  it('does not mutate its input and keeps perFilter in input order', () => {
    const input = query([filter({ id: 'b', matchingRows: 10 }), filter({ id: 'a', index: 'none' })]);
    const snapshot = JSON.stringify(input);
    const result = simulate(input, ruleSet);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(result.perFilter.map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('SelectivityRuleSetSchema parses the test rule set and rejects a bad operator', () => {
    expect(SelectivityRuleSetSchema.safeParse(ruleSet).success).toBe(true);
    expect(SelectivityRulesSchema.safeParse({ ...rules, nonSelectiveOperators: [{ operator: 'contains' }] }).success).toBe(false);
    expect(SelectivityRulesSchema.safeParse({ ...rules, thresholds: { ...rules.thresholds, custom: { firstMillionPct: 10, beyondPct: 5 } } }).success).toBe(false);
  });

  it('SelectivityInputSchema enforces SIM_CONFIG.selectivity and referential sanity', () => {
    expect(SelectivityInputSchema.safeParse(query([filter({ id: 'a' })])).success).toBe(true);
    expect(SelectivityInputSchema.safeParse(query([filter({ id: 'a' })], SIM_CONFIG.selectivity.minRows - 1)).success).toBe(false);
    expect(SelectivityInputSchema.safeParse(query([filter({ id: 'a' })], SIM_CONFIG.selectivity.maxRows + 1)).success).toBe(false);
    expect(SelectivityInputSchema.safeParse(query([])).success).toBe(false);
    const tooMany = Array.from({ length: SIM_CONFIG.selectivity.maxFilters + 1 }, (_, i) => filter({ id: `f${i}` }));
    expect(SelectivityInputSchema.safeParse(query(tooMany)).success).toBe(false);
    expect(SelectivityInputSchema.safeParse(query([filter({ id: 'a' }), filter({ id: 'a' })])).success).toBe(false);
    expect(SelectivityInputSchema.safeParse(query([filter({ id: 'a', matchingRows: 2_000 })], 1_000)).success).toBe(false);
    expect(SelectivityInputSchema.safeParse({ ...query([filter({ id: 'a' })]), combinator: 'XOR' }).success).toBe(false);
  });
});
