// Golden tests: every case in order-of-execution.golden.json is run through simulate() against the pinned rule set
// and compared whole. Regenerate deliberately with `UPDATE_GOLDENS=1 npx vitest run data/simulations/order-of-execution`
// and review the diff; a silent regeneration would defeat the point of a golden.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { OoEInputSchema, simulate } from '../../../lib/simulations/order-of-execution/index.ts';
import type { OoEInput, OoEResult, OoERules } from '../../../lib/simulations/order-of-execution/index.ts';
import type { RuleSet } from '../../../lib/simulations/rule-set.ts';
import { current, history } from './index.ts';

interface GoldenCase {
  name: string;
  ruleSetId: string;
  input: OoEInput;
  expected: OoEResult;
}
interface GoldenFile {
  $comment: string;
  cases: GoldenCase[];
}

const MIN_CASES = 6;
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'order-of-execution.golden.json');
const golden = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
const update = process.env.UPDATE_GOLDENS === '1';
const ruleSets = new Map<string, RuleSet<OoERules>>([current, ...history].map((set) => [set.id, set]));

function resolve(id: string): RuleSet<OoERules> {
  const set = ruleSets.get(id);
  if (!set) throw new Error(`golden case pins unknown rule set '${id}'`);
  return set;
}

describe('order-of-execution goldens', () => {
  it(`ships at least ${MIN_CASES} cases with unique names covering a rerun, a delete and an imperfect learner order`, () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(MIN_CASES);
    expect(new Set(golden.cases.map((c) => c.name)).size).toBe(golden.cases.length);
    expect(golden.cases.some((c) => c.expected.reruns.length > 0)).toBe(true);
    expect(golden.cases.some((c) => c.input.operation === 'delete')).toBe(true);
    expect(golden.cases.some((c) => c.expected.score > 0 && c.expected.score < 100 && c.expected.diff.length > 0)).toBe(true);
  });

  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, goldenCase) => {
    expect(OoEInputSchema.safeParse(goldenCase.input).success).toBe(true);
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
