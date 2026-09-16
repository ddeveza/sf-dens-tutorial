// Golden tests: every case in governor-limits.golden.json is run through simulate() against the pinned rule set and
// compared whole. Regenerate deliberately with `UPDATE_GOLDENS=1 npx vitest run data/simulations/governor-limits`
// and review the diff; a silent regeneration would defeat the point of a golden.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { GovernorInputSchema, simulate } from '../../../lib/simulations/governor-limits/index.ts';
import type { GovernorInput, GovernorResult, GovernorRules } from '../../../lib/simulations/governor-limits/index.ts';
import type { RuleSet } from '../../../lib/simulations/rule-set.ts';
import { current, history } from './index.ts';

interface GoldenCase {
  name: string;
  ruleSetId: string;
  input: GovernorInput;
  expected: GovernorResult;
}
interface GoldenFile {
  $comment: string;
  cases: GoldenCase[];
}

const MIN_CASES = 6;
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'governor-limits.golden.json');
const golden = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
const update = process.env.UPDATE_GOLDENS === '1';
const ruleSets = new Map<string, RuleSet<GovernorRules>>([current, ...history].map((set) => [set.id, set]));

function resolve(id: string): RuleSet<GovernorRules> {
  const set = ruleSets.get(id);
  if (!set) throw new Error(`golden case pins unknown rule set '${id}'`);
  return set;
}

describe('governor-limits goldens', () => {
  it(`ships at least ${MIN_CASES} cases with unique names and covers both releases and sync + async contexts`, () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(MIN_CASES);
    expect(new Set(golden.cases.map((c) => c.name)).size).toBe(golden.cases.length);
    expect(new Set(golden.cases.map((c) => c.ruleSetId))).toEqual(new Set(['governor-limits@summer-26', 'governor-limits@winter-27']));
    const contexts = new Set(golden.cases.map((c) => c.input.context));
    expect(contexts.has('sync')).toBe(true);
    expect([...contexts].some((c) => c !== 'sync')).toBe(true);
    expect(golden.cases.some((c) => c.expected.firstBreach === undefined)).toBe(true);
    expect(golden.cases.some((c) => c.expected.firstBreach?.limit === 'heapBytes')).toBe(true);
  });

  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, goldenCase) => {
    expect(GovernorInputSchema.safeParse(goldenCase.input).success).toBe(true);
    const actual = simulate(goldenCase.input, resolve(goldenCase.ruleSetId));
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
