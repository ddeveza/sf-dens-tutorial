// Golden tests: every case in sharing.golden.json is run through simulate() against the pinned rule set and compared
// whole. Regenerate deliberately with `UPDATE_GOLDENS=1 npx vitest run data/simulations/sharing` and review the diff;
// a silent regeneration would defeat the point of a golden.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SharingInputSchema, simulate } from '../../../lib/simulations/sharing/index.ts';
import type { SharingInput, SharingResult, SharingRules } from '../../../lib/simulations/sharing/index.ts';
import type { RuleSet } from '../../../lib/simulations/rule-set.ts';
import { current, history } from './index.ts';

interface GoldenCase {
  name: string;
  ruleSetId: string;
  input: SharingInput;
  expected: SharingResult;
}
interface GoldenFile {
  $comment: string;
  cases: GoldenCase[];
}

const MIN_CASES = 6;
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sharing.golden.json');
const golden = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
const update = process.env.UPDATE_GOLDENS === '1';
const ruleSets = new Map<string, RuleSet<SharingRules>>([current, ...history].map((set) => [set.id, set]));

function resolve(id: string): RuleSet<SharingRules> {
  const set = ruleSets.get(id);
  if (!set) throw new Error(`golden case pins unknown rule set '${id}'`);
  return set;
}

function hasObjectRead(user: SharingInput['users'][number]): boolean {
  const all = [user.profile, ...user.permissionSets.map((ps) => ps.perms)];
  return all.some((p) => p.read || p.viewAll || p.viewAllData || p.modifyAll || p.modifyAllData);
}

describe('sharing goldens', () => {
  it(`ships at least ${MIN_CASES} cases with unique names and the mandatory scenarios`, () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(MIN_CASES);
    expect(new Set(golden.cases.map((c) => c.name)).size).toBe(golden.cases.length);
    expect(golden.cases.every((c) => ruleSets.has(c.ruleSetId))).toBe(true);

    // A standard object with the hierarchy toggle set to false: the engine must force it on.
    const forcedOn = golden.cases.filter((c) => !c.input.object.custom && !c.input.object.grantAccessUsingHierarchies);
    expect(forcedOn.length).toBeGreaterThan(0);
    expect(forcedOn.some((c) => c.expected.trace.some((t) => t.rule === 'role_hierarchy' && t.effect === 'grant' && t.note.includes('always on for standard objects')))).toBe(true);

    // A permission set opening the CRUD gate that the profile leaves shut.
    expect(
      golden.cases.some((c) => {
        const user = c.input.users.find((u) => u.id === c.input.question.userId);
        return user !== undefined && !user.profile.read && hasObjectRead(user) && c.expected.granted && c.expected.trace[0].note.includes('permission set');
      }),
    ).toBe(true);

    // A manual share capped at edit cannot satisfy a delete request.
    expect(
      golden.cases.some(
        (c) => c.input.question.wants === 'delete' && c.input.manualShares.some((s) => s.userId === c.input.question.userId && s.access === 'edit') && c.expected.access === 'edit' && !c.expected.granted,
      ),
    ).toBe(true);

    // Coverage of the remaining named steps.
    expect(golden.cases.some((c) => c.expected.trace.length === 1 && c.expected.access === 'none')).toBe(true);
    expect(golden.cases.some((c) => c.expected.trace.some((t) => t.rule === 'modify_all' && t.effect === 'grant'))).toBe(true);
    expect(golden.cases.some((c) => c.expected.trace.some((t) => t.rule.startsWith('sharing_rule:') && t.effect === 'grant'))).toBe(true);
    expect(golden.cases.some((c) => c.input.object.owd === 'ControlledByParent')).toBe(true);
    expect(golden.cases.some((c) => c.expected.granted)).toBe(true);
    expect(golden.cases.some((c) => !c.expected.granted)).toBe(true);
  });

  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, goldenCase) => {
    const parsed = SharingInputSchema.safeParse(goldenCase.input);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
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
