// Sharing Simulator engine tests (ARCHITECTURE.md, Simulations > Sharing Simulator). Table-driven, pure: the rule
// set is built here so the engine is tested independently of data/simulations/sharing (goldens cover that file).
import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config.ts';
import type { RuleSet } from '../rule-set.ts';
import { SharingInputSchema, SharingRuleSetSchema, SharingRulesSchema, simulate } from './index.ts';
import type { ObjectPerms, SharingInput, SharingResult, SharingRules } from './index.ts';

const NO_PERMS: ObjectPerms = {
  read: false,
  edit: false,
  delete: false,
  viewAll: false,
  modifyAll: false,
  viewAllData: false,
  modifyAllData: false,
};
const perms = (over: Partial<ObjectPerms>): ObjectPerms => ({ ...NO_PERMS, ...over });
const READ_ONLY = perms({ read: true });
const READ_EDIT = perms({ read: true, edit: true });
const CRUD = perms({ read: true, edit: true, delete: true });

const rules: SharingRules = {
  hierarchyAlwaysOnForStandard: true,
  owdBaseline: { Private: 'none', PublicReadOnly: 'read', PublicReadWrite: 'edit' },
  ownerAccess: 'full',
  modifyAllAccess: 'full',
  viewAllAccess: 'read',
  maxGrantFromRules: 'edit',
  deleteRequires: 'full',
};

function ruleSetWith(over: Partial<SharingRules> = {}): RuleSet<SharingRules> {
  return {
    id: 'sharing@summer-26',
    simulation: 'sharing',
    release: 'summer-26',
    apiVersion: '67.0',
    sourceIds: ['help-sharing-features'],
    verification: { release: 'summer-26', apiVersion: '67.0', docVersion: 'test', lastVerified: '2026-09-04', status: 'verified' },
    rules: { ...rules, ...over },
  };
}
const ruleSet = ruleSetWith();

// Roles: ceo > vp > rep. Users: 'owner' (rep) owns the record; 'manager' (vp) sits above; 'peer' (rep) sits beside;
// 'ceo-user' (ceo) sits at the top; 'roleless' has no role. Every user starts with full CRUD on the object.
function scenario(over: Partial<SharingInput> = {}): SharingInput {
  return {
    object: { owd: 'Private', custom: false, grantAccessUsingHierarchies: true },
    roles: [{ id: 'ceo' }, { id: 'vp', parentId: 'ceo' }, { id: 'rep', parentId: 'vp' }],
    users: [
      { id: 'owner', roleId: 'rep', profile: CRUD, permissionSets: [] },
      { id: 'manager', roleId: 'vp', profile: CRUD, permissionSets: [] },
      { id: 'peer', roleId: 'rep', profile: CRUD, permissionSets: [] },
      { id: 'ceo-user', roleId: 'ceo', profile: CRUD, permissionSets: [] },
      { id: 'roleless', profile: CRUD, permissionSets: [] },
    ],
    record: { id: 'acc-1', ownerId: 'owner', fields: { Region__c: 'EMEA', Tier__c: 2 } },
    sharingRules: [],
    manualShares: [],
    question: { userId: 'manager', wants: 'read' },
    ...over,
  };
}

function withUser(input: SharingInput, id: string, patch: Partial<SharingInput['users'][number]>): SharingInput {
  return { ...input, users: input.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
}

function step(result: SharingResult, rule: string) {
  const found = result.trace.find((t) => t.rule === rule);
  if (!found) throw new Error(`trace has no step '${rule}': ${result.trace.map((t) => t.rule).join(', ')}`);
  return found;
}

describe('object CRUD gate', () => {
  it('no object Read anywhere => none, and the trace stops at the gate whatever sharing says', () => {
    const input = withUser(scenario({ object: { owd: 'PublicReadWrite', custom: false, grantAccessUsingHierarchies: true } }), 'manager', {
      profile: NO_PERMS,
    });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'none', granted: false });
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]).toMatchObject({ rule: 'object_permissions', effect: 'gate', access: 'none' });
  });

  it('names the profile as the grantor when the profile opens the gate', () => {
    const result = simulate(scenario({ object: { owd: 'PublicReadOnly', custom: false, grantAccessUsingHierarchies: true } }), ruleSet);
    expect(step(result, 'object_permissions')).toMatchObject({ effect: 'gate', access: 'full' });
    expect(step(result, 'object_permissions').note).toContain('Read: profile');
  });

  it('a permission set opens the gate when the profile has no Read, and the trace names the permission set', () => {
    const input = withUser(scenario({ object: { owd: 'PublicReadOnly', custom: false, grantAccessUsingHierarchies: true } }), 'manager', {
      profile: NO_PERMS,
      permissionSets: [{ id: 'ps-account-reader', perms: READ_ONLY }],
    });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'read', granted: true });
    const gate = step(result, 'object_permissions');
    expect(gate).toMatchObject({ effect: 'gate', access: 'read' });
    expect(gate.note).toContain("Read: permission set 'ps-account-reader'");
    expect(gate.note).toContain('Edit: not granted');
  });

  it('merges profile and every permission set with OR per flag', () => {
    const input = withUser(scenario({ question: { userId: 'owner', wants: 'delete' } }), 'owner', {
      profile: READ_ONLY,
      permissionSets: [
        { id: 'ps-editor', perms: perms({ edit: true }) },
        { id: 'ps-deleter', perms: perms({ delete: true }) },
      ],
    });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'full', granted: true });
    const gate = step(result, 'object_permissions');
    expect(gate.note).toContain("Edit: permission set 'ps-editor'");
    expect(gate.note).toContain("Delete: permission set 'ps-deleter'");
  });

  it('object permissions win over sharing: Public Read/Write cannot give edit to a read-only profile', () => {
    const input = withUser(
      scenario({ object: { owd: 'PublicReadWrite', custom: false, grantAccessUsingHierarchies: true }, question: { userId: 'peer', wants: 'edit' } }),
      'peer',
      { profile: READ_ONLY },
    );
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'read', granted: false });
    expect(step(result, 'owd')).toMatchObject({ effect: 'grant', access: 'edit' });
    expect(step(result, 'required_access').note).toContain('capped at read by object permissions');
  });
});

describe('Modify All / View All', () => {
  it('Modify All Data => full on a Private object for a non-owner, and the grantor is named', () => {
    const input = withUser(scenario({ question: { userId: 'peer', wants: 'edit' } }), 'peer', {
      profile: NO_PERMS,
      permissionSets: [{ id: 'ps-mad', perms: perms({ modifyAllData: true }) }],
    });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'full', granted: true });
    const mod = step(result, 'modify_all');
    expect(mod).toMatchObject({ effect: 'grant', access: 'full' });
    expect(mod.note).toContain("Modify All Data via permission set 'ps-mad'");
    expect(step(result, 'owner').effect).toBe('none');
  });

  it('Modify All Records on the object => full, including delete, without the Delete flag', () => {
    const input = withUser(scenario({ question: { userId: 'peer', wants: 'delete' } }), 'peer', { profile: perms({ modifyAll: true }) });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'full', granted: true });
    expect(step(result, 'modify_all').note).toContain('Modify All Records on this object via profile');
  });

  it('View All Records => read at minimum on a Private object', () => {
    const input = withUser(scenario({ question: { userId: 'peer', wants: 'read' } }), 'peer', { profile: perms({ viewAll: true }) });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'read', granted: true });
    expect(step(result, 'view_all')).toMatchObject({ effect: 'grant', access: 'read' });
  });

  it('View All Data => read at minimum but not edit', () => {
    const input = withUser(scenario({ question: { userId: 'peer', wants: 'edit' } }), 'peer', { profile: perms({ viewAllData: true, edit: true }) });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'read', granted: false });
    expect(step(result, 'view_all').note).toContain('View All Data via profile');
  });
});

describe('owner and OWD baseline', () => {
  it('the owner gets full access on a Private object and can delete with the Delete flag', () => {
    const result = simulate(scenario({ question: { userId: 'owner', wants: 'delete' } }), ruleSet);
    expect(result).toMatchObject({ access: 'full', granted: true });
    expect(step(result, 'owner')).toMatchObject({ effect: 'grant', access: 'full' });
  });

  it('the owner without the Delete object permission is capped at edit and cannot delete', () => {
    const input = withUser(scenario({ question: { userId: 'owner', wants: 'delete' } }), 'owner', { profile: READ_EDIT });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'edit', granted: false });
    expect(step(result, 'object_permissions')).toMatchObject({ access: 'edit' });
    expect(step(result, 'required_access').note).toContain('needs full');
  });

  it.each([
    ['Private', 'none', false],
    ['PublicReadOnly', 'read', true],
    ['PublicReadWrite', 'edit', true],
  ] as const)('OWD %s gives a peer baseline %s (read granted: %s)', (owd, baseline, granted) => {
    const result = simulate(
      scenario({ object: { owd, custom: false, grantAccessUsingHierarchies: true }, question: { userId: 'peer', wants: 'read' } }),
      ruleSet,
    );
    expect(result.access).toBe(baseline);
    expect(result.granted).toBe(granted);
    expect(step(result, 'owd').effect).toBe(baseline === 'none' ? 'none' : 'grant');
  });

  it('OWD baselines come from the rule set, not the engine', () => {
    const result = simulate(
      scenario({ object: { owd: 'PublicReadOnly', custom: false, grantAccessUsingHierarchies: true }, question: { userId: 'peer', wants: 'edit' } }),
      ruleSetWith({ owdBaseline: { Private: 'none', PublicReadOnly: 'edit', PublicReadWrite: 'edit' } }),
    );
    expect(result).toMatchObject({ access: 'edit', granted: true });
  });
});

describe('role hierarchy', () => {
  it('standard object with the toggle off: hierarchy is forced on and the trace says so', () => {
    const result = simulate(scenario({ object: { owd: 'Private', custom: false, grantAccessUsingHierarchies: false } }), ruleSet);
    expect(result).toMatchObject({ access: 'full', granted: true });
    const hier = step(result, 'role_hierarchy');
    expect(hier).toMatchObject({ effect: 'grant', access: 'full' });
    expect(hier.note).toContain('always on for standard objects');
  });

  it('custom object with the toggle off: roles above the owner get nothing', () => {
    const result = simulate(scenario({ object: { owd: 'Private', custom: true, grantAccessUsingHierarchies: false } }), ruleSet);
    expect(result).toMatchObject({ access: 'none', granted: false });
    expect(step(result, 'role_hierarchy').effect).toBe('none');
    expect(step(result, 'role_hierarchy').note).not.toContain('always on for standard objects');
  });

  it('custom object with the toggle on: the role above the owner gets owner-level access', () => {
    const result = simulate(scenario({ object: { owd: 'Private', custom: true, grantAccessUsingHierarchies: true } }), ruleSet);
    expect(result).toMatchObject({ access: 'full', granted: true });
  });

  it('a standard object honours hierarchyAlwaysOnForStandard=false from the rule set', () => {
    const result = simulate(
      scenario({ object: { owd: 'Private', custom: false, grantAccessUsingHierarchies: false } }),
      ruleSetWith({ hierarchyAlwaysOnForStandard: false }),
    );
    expect(result).toMatchObject({ access: 'none', granted: false });
  });

  it('two levels up still counts as above the owner', () => {
    const result = simulate(scenario({ question: { userId: 'ceo-user', wants: 'edit' } }), ruleSet);
    expect(result).toMatchObject({ access: 'full', granted: true });
  });

  it('the same role as the owner is not above the owner', () => {
    const result = simulate(scenario({ question: { userId: 'peer', wants: 'read' } }), ruleSet);
    expect(result).toMatchObject({ access: 'none', granted: false });
    expect(step(result, 'role_hierarchy').note).toContain('not above');
  });

  it('a user without a role gets nothing from the hierarchy', () => {
    const result = simulate(scenario({ question: { userId: 'roleless', wants: 'read' } }), ruleSet);
    expect(result.granted).toBe(false);
    expect(step(result, 'role_hierarchy').note).toContain('has no role');
  });

  it('an owner outside the simulated users (a queue) gives the hierarchy nothing to climb', () => {
    const result = simulate(scenario({ record: { id: 'acc-1', ownerId: 'queue-support', fields: {} } }), ruleSet);
    expect(result.granted).toBe(false);
    expect(step(result, 'role_hierarchy').note).toContain("owner 'queue-support' has no role");
  });
});

describe('sharing rules', () => {
  it('an owner-based rule shares records owned by a role with another role', () => {
    const input = scenario({
      sharingRules: [{ id: 'rep-to-vp', kind: 'owner', match: { ownerRoleId: 'rep' }, shareWith: { roleId: 'vp' }, access: 'edit' }],
      question: { userId: 'peer', wants: 'edit' },
    });
    const peer = simulate(input, ruleSet);
    expect(peer).toMatchObject({ access: 'none', granted: false });
    expect(step(peer, 'sharing_rule:rep-to-vp').note).toContain('not include');

    const manager = simulate({ ...input, object: { owd: 'Private', custom: true, grantAccessUsingHierarchies: false }, question: { userId: 'manager', wants: 'edit' } }, ruleSet);
    expect(manager).toMatchObject({ access: 'edit', granted: true });
    expect(step(manager, 'sharing_rule:rep-to-vp')).toMatchObject({ effect: 'grant', access: 'edit' });
  });

  it('a criteria-based rule matches on a field value and can share with a role and its subordinates', () => {
    const rule = { id: 'emea-readers', kind: 'criteria', match: { field: 'Region__c', equals: 'EMEA' }, shareWith: { roleId: 'ceo', roleAndSubordinates: true }, access: 'read' } as const;
    const hit = simulate(scenario({ sharingRules: [rule], question: { userId: 'peer', wants: 'read' } }), ruleSet);
    expect(hit).toMatchObject({ access: 'read', granted: true });

    const miss = simulate(
      scenario({ sharingRules: [rule], record: { id: 'acc-2', ownerId: 'owner', fields: { Region__c: 'APAC' } }, question: { userId: 'peer', wants: 'read' } }),
      ruleSet,
    );
    expect(miss).toMatchObject({ access: 'none', granted: false });
    expect(step(miss, 'sharing_rule:emea-readers').note).toContain('no match');
  });

  it('role-and-subordinates is off by default: a subordinate role is not the role itself', () => {
    const rule = { id: 'ceo-only', kind: 'criteria', match: { field: 'Region__c', equals: 'EMEA' }, shareWith: { roleId: 'ceo' }, access: 'read' } as const;
    const result = simulate(scenario({ sharingRules: [rule], question: { userId: 'peer', wants: 'read' } }), ruleSet);
    expect(result.granted).toBe(false);
  });

  it('a rule shared with a single user works and rules only widen (max of grants)', () => {
    const input = scenario({
      object: { owd: 'PublicReadWrite', custom: false, grantAccessUsingHierarchies: true },
      sharingRules: [{ id: 'to-peer', kind: 'criteria', match: { field: 'Tier__c', equals: 2 }, shareWith: { userId: 'peer' }, access: 'read' }],
      question: { userId: 'peer', wants: 'edit' },
    });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'edit', granted: true });
    expect(step(result, 'sharing_rule:to-peer').effect).toBe('none');
  });

  it('rule grants are capped at maxGrantFromRules', () => {
    const input = scenario({
      sharingRules: [{ id: 'wide', kind: 'criteria', match: { field: 'Region__c', equals: 'EMEA' }, shareWith: { userId: 'peer' }, access: 'edit' }],
      question: { userId: 'peer', wants: 'edit' },
    });
    const result = simulate(input, ruleSetWith({ maxGrantFromRules: 'read' }));
    expect(result).toMatchObject({ access: 'read', granted: false });
    expect(step(result, 'sharing_rule:wide').note).toContain('capped at read');
  });

  it('a sharing rule never reaches full: delete still needs full', () => {
    const input = scenario({
      sharingRules: [{ id: 'editors', kind: 'criteria', match: { field: 'Region__c', equals: 'EMEA' }, shareWith: { userId: 'peer' }, access: 'edit' }],
      question: { userId: 'peer', wants: 'delete' },
    });
    const result = simulate(input, ruleSet);
    expect(result).toMatchObject({ access: 'edit', granted: false });
  });
});

describe('manual shares', () => {
  it('a manual share widens to edit but is capped there: a delete request is denied', () => {
    const result = simulate(scenario({ manualShares: [{ userId: 'peer', access: 'edit' }], question: { userId: 'peer', wants: 'delete' } }), ruleSet);
    expect(result).toMatchObject({ access: 'edit', granted: false });
    expect(step(result, 'manual_share')).toMatchObject({ effect: 'grant', access: 'edit' });
    expect(step(result, 'required_access').note).toContain('needs full');
  });

  it('a manual share for a different user does nothing', () => {
    const result = simulate(scenario({ manualShares: [{ userId: 'manager', access: 'edit' }], question: { userId: 'peer', wants: 'read' } }), ruleSet);
    expect(result.granted).toBe(false);
    expect(step(result, 'manual_share').effect).toBe('none');
  });

  it('a manual share below the current access is a no-op (widen only)', () => {
    const result = simulate(
      scenario({
        object: { owd: 'PublicReadWrite', custom: false, grantAccessUsingHierarchies: true },
        manualShares: [{ userId: 'peer', access: 'read' }],
        question: { userId: 'peer', wants: 'edit' },
      }),
      ruleSet,
    );
    expect(result).toMatchObject({ access: 'edit', granted: true });
    expect(step(result, 'manual_share').effect).toBe('none');
  });
});

describe('Controlled by Parent', () => {
  const cbp = { owd: 'ControlledByParent', custom: true, grantAccessUsingHierarchies: false } as const;

  it('defers to record.parentAccess', () => {
    const base = scenario({ object: cbp, record: { id: 'line-1', ownerId: 'owner', fields: {}, parentAccess: 'read' } });
    expect(simulate({ ...base, question: { userId: 'peer', wants: 'read' } }, ruleSet)).toMatchObject({ access: 'read', granted: true });
    expect(simulate({ ...base, question: { userId: 'peer', wants: 'edit' } }, ruleSet)).toMatchObject({ access: 'read', granted: false });
    expect(step(simulate({ ...base, question: { userId: 'peer', wants: 'read' } }, ruleSet), 'owd').note).toContain('Controlled by Parent');
  });

  it('without parentAccess the baseline is none, and the child has no rules or manual shares of its own', () => {
    const result = simulate(
      scenario({
        object: cbp,
        sharingRules: [{ id: 'r', kind: 'criteria', match: { field: 'Region__c', equals: 'EMEA' }, shareWith: { userId: 'peer' }, access: 'edit' }],
        manualShares: [{ userId: 'peer', access: 'edit' }],
        question: { userId: 'peer', wants: 'read' },
      }),
      ruleSet,
    );
    expect(result).toMatchObject({ access: 'none', granted: false });
    expect(step(result, 'owd').effect).toBe('none');
    expect(step(result, 'sharing_rule:r').effect).toBe('none');
    expect(step(result, 'manual_share').effect).toBe('none');
  });
});

describe('trace shape and purity', () => {
  it('emits every named step in the documented order', () => {
    const input = scenario({
      sharingRules: [
        { id: 'r1', kind: 'owner', match: { ownerRoleId: 'rep' }, shareWith: { roleId: 'vp' }, access: 'read' },
        { id: 'r2', kind: 'criteria', match: { field: 'Region__c', equals: 'EMEA' }, shareWith: { userId: 'peer' }, access: 'read' },
      ],
      manualShares: [{ userId: 'peer', access: 'read' }],
      question: { userId: 'peer', wants: 'read' },
    });
    const result = simulate(input, ruleSet);
    expect(result.trace.map((t) => t.rule)).toEqual([
      'object_permissions',
      'modify_all',
      'view_all',
      'owner',
      'owd',
      'role_hierarchy',
      'sharing_rule:r1',
      'sharing_rule:r2',
      'manual_share',
      'required_access',
    ]);
    expect(result.trace.every((t) => ['gate', 'grant', 'none'].includes(t.effect))).toBe(true);
    expect(result.trace.every((t) => t.note.length > 0)).toBe(true);
    expect(result.trace.at(-1)).toMatchObject({ rule: 'required_access', effect: 'gate', access: 'read' });
  });

  it('does not mutate its input', () => {
    const input = scenario({ manualShares: [{ userId: 'peer', access: 'edit' }], question: { userId: 'peer', wants: 'delete' } });
    const snapshot = JSON.stringify(input);
    simulate(input, ruleSet);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('schemas', () => {
  it('SharingRuleSetSchema parses the test rule set and rejects another simulation id', () => {
    expect(SharingRuleSetSchema.safeParse(ruleSet).success).toBe(true);
    expect(SharingRuleSetSchema.safeParse({ ...ruleSet, id: 'governor-limits@summer-26', simulation: 'governor-limits' }).success).toBe(false);
    expect(SharingRulesSchema.safeParse({ ...rules, deleteRequires: 'total' }).success).toBe(false);
  });

  it('SharingInputSchema accepts the base scenario', () => {
    expect(SharingInputSchema.safeParse(scenario()).success).toBe(true);
  });

  it.each([
    ['unknown question user', scenario({ question: { userId: 'ghost', wants: 'read' } })],
    ['unknown role on a user', withUser(scenario(), 'peer', { roleId: 'nope' })],
    ['duplicate user ids', scenario({ users: [...scenario().users, { id: 'peer', profile: CRUD, permissionSets: [] }].slice(-SIM_CONFIG.sharing.maxSimUsers) })],
    ['unknown parent role', scenario({ roles: [{ id: 'ceo' }, { id: 'vp', parentId: 'board' }, { id: 'rep', parentId: 'vp' }] })],
    ['role cycle', scenario({ roles: [{ id: 'ceo', parentId: 'rep' }, { id: 'vp', parentId: 'ceo' }, { id: 'rep', parentId: 'vp' }] })],
    ['owner rule without ownerRoleId', scenario({ sharingRules: [{ id: 'r', kind: 'owner', match: {}, shareWith: { roleId: 'vp' }, access: 'read' }] })],
    ['criteria rule without a field', scenario({ sharingRules: [{ id: 'r', kind: 'criteria', match: { equals: 'x' }, shareWith: { roleId: 'vp' }, access: 'read' }] })],
    ['rule shared with nobody', scenario({ sharingRules: [{ id: 'r', kind: 'owner', match: { ownerRoleId: 'rep' }, shareWith: {}, access: 'read' }] })],
    ['manual share for an unknown user', scenario({ manualShares: [{ userId: 'ghost', access: 'read' }] })],
  ])('rejects %s', (_label, input) => {
    expect(SharingInputSchema.safeParse(input).success).toBe(false);
  });

  it('enforces the UI caps from SIM_CONFIG.sharing', () => {
    const tooManyUsers = scenario({
      users: Array.from({ length: SIM_CONFIG.sharing.maxSimUsers + 1 }, (_, i) => ({ id: `u${i}`, profile: CRUD, permissionSets: [] })),
      record: { id: 'acc-1', ownerId: 'u0', fields: {} },
      question: { userId: 'u1', wants: 'read' },
    });
    expect(SharingInputSchema.safeParse(tooManyUsers).success).toBe(false);

    const deepRoles = Array.from({ length: SIM_CONFIG.sharing.maxRoleDepth + 1 }, (_, i) => (i === 0 ? { id: 'r0' } : { id: `r${i}`, parentId: `r${i - 1}` }));
    expect(SharingInputSchema.safeParse(scenario({ roles: deepRoles, users: [{ id: 'owner', roleId: 'r0', profile: CRUD, permissionSets: [] }], question: { userId: 'owner', wants: 'read' } })).success).toBe(false);
    const okRoles = deepRoles.slice(0, SIM_CONFIG.sharing.maxRoleDepth);
    expect(SharingInputSchema.safeParse(scenario({ roles: okRoles, users: [{ id: 'owner', roleId: 'r0', profile: CRUD, permissionSets: [] }], question: { userId: 'owner', wants: 'read' } })).success).toBe(true);

    const tooManyRules = scenario({
      sharingRules: Array.from({ length: SIM_CONFIG.sharing.maxRules + 1 }, (_, i) => ({ id: `r${i}`, kind: 'owner' as const, match: { ownerRoleId: 'rep' }, shareWith: { roleId: 'vp' }, access: 'read' as const })),
    });
    expect(SharingInputSchema.safeParse(tooManyRules).success).toBe(false);

    const tooManyPermSets = withUser(scenario(), 'peer', {
      permissionSets: Array.from({ length: SIM_CONFIG.sharing.maxPermissionSetsPerUser + 1 }, (_, i) => ({ id: `ps${i}`, perms: READ_ONLY })),
    });
    expect(SharingInputSchema.safeParse(tooManyPermSets).success).toBe(false);
  });
});
