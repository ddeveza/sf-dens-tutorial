// Golden tests: every case in soql-selectivity.golden.json is run through simulate() against the pinned rule set and
// compared whole. A case may carry `rulesOverride` (a partial SelectivityRules merged onto the pinned set) so that
// rule-set-level switches such as customIndexIncludesNulls can be covered in both positions within one release.
// Regenerate deliberately with `UPDATE_GOLDENS=1 npx vitest run data/simulations/soql-selectivity` and review the
// diff; a silent regeneration would defeat the point of a golden.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SelectivityInputSchema, SelectivityRuleSetSchema, simulate } from '../../../lib/simulations/soql-selectivity/index.ts';
import type { SelectivityInput, SelectivityResult, SelectivityRules } from '../../../lib/simulations/soql-selectivity/index.ts';
import type { RuleSet } from '../../../lib/simulations/rule-set.ts';
import { current, history } from './index.ts';

interface GoldenCase {
  name: string;
  ruleSetId: string;
  rulesOverride?: Partial<SelectivityRules>;
  input: SelectivityInput;
  expected: SelectivityResult;
}
interface GoldenFile {
  $comment: string;
  cases: GoldenCase[];
}

const MIN_CASES = 6;
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'soql-selectivity.golden.json');
const golden = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
const update = process.env.UPDATE_GOLDENS === '1';
const ruleSets = new Map<string, RuleSet<SelectivityRules>>([current, ...history].map((set) => [set.id, set]));

function resolve(goldenCase: GoldenCase): RuleSet<SelectivityRules> {
  const set = ruleSets.get(goldenCase.ruleSetId);
  if (!set) throw new Error(`golden case pins unknown rule set '${goldenCase.ruleSetId}'`);
  if (!goldenCase.rulesOverride) return set;
  const overridden = { ...set, rules: { ...set.rules, ...goldenCase.rulesOverride } };
  SelectivityRuleSetSchema.parse(overridden);
  return overridden;
}

function isNullOnCustom(c: GoldenCase): boolean {
  return c.input.filters.some((f) => f.operator === 'isNull' && f.index === 'custom');
}

describe('soql-selectivity goldens', () => {
  it(`ships at least ${MIN_CASES} cases with unique names and the mandatory scenarios`, () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(MIN_CASES);
    expect(new Set(golden.cases.map((c) => c.name)).size).toBe(golden.cases.length);
    expect(golden.cases.every((c) => ruleSets.has(c.ruleSetId))).toBe(true);

    // OR-sum over threshold: every branch usable alone, union not selective.
    expect(golden.cases.some((c) => c.input.combinator === 'OR' && c.expected.perFilter.every((f) => f.usable) && !c.expected.selective)).toBe(true);

    // isNull on a custom index in both rule-set positions.
    expect(golden.cases.some((c) => isNullOnCustom(c) && !(c.rulesOverride?.customIndexIncludesNulls ?? current.rules.customIndexIncludesNulls) && !c.expected.selective)).toBe(true);
    expect(golden.cases.some((c) => isNullOnCustom(c) && (c.rulesOverride?.customIndexIncludesNulls ?? current.rules.customIndexIncludesNulls) && c.expected.selective)).toBe(true);

    // Leading-wildcard LIKE, a formula field, and the Day 23 prediction (5M rows, custom index, 400,000 matches).
    expect(golden.cases.some((c) => c.input.filters.some((f) => f.operator === 'likeLeadingWildcard') && !c.expected.selective)).toBe(true);
    expect(golden.cases.some((c) => c.input.filters.some((f) => f.fieldKind === 'formula') && !c.expected.selective)).toBe(true);
    expect(
      golden.cases.some((c) => c.input.totalRows === 5_000_000 && c.input.filters.some((f) => f.index === 'custom' && f.matchingRows === 400_000) && c.expected.plan === 'fullScan'),
    ).toBe(true);

    expect(golden.cases.some((c) => c.expected.selective)).toBe(true);
  });

  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, goldenCase) => {
    const parsed = SelectivityInputSchema.safeParse(goldenCase.input);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
    const actual = simulate(goldenCase.input, resolve(goldenCase));
    if (update) {
      goldenCase.expected = actual;
      return;
    }
    expect(actual).toEqual(goldenCase.expected);
  });

  afterAll(() => {
    if (update) writeFileSync(file, `${JSON.stringify(golden, null, 2)}\n`);
  });
});
