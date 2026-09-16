// Sharing Simulator (ARCHITECTURE.md, Simulations > Sharing Simulator). Pure: plain objects in and out, no IO, no env,
// no clock. The engine answers "can user A <read|edit|delete> record B?" with an ordered, named trace. Every rule value
// (OWD baselines, what the owner / Modify All / View All grant, the rule cap, what delete needs, whether the hierarchy
// is forced on for standard objects) comes from the RuleSet the page passes (data/simulations/sharing/<release>.ts).
import { z } from 'zod';
import { SIM_CONFIG } from '../config.ts';
import type { RuleSet } from '../rule-set.ts';
import { ruleSetSchema } from '../rule-set-schema.ts';

// Ordered from nothing to everything; the index is the rank used by "only widen" and "needs at least" comparisons.
export const ACCESS_LEVELS = ['none', 'read', 'edit', 'full'] as const;
export type Access = (typeof ACCESS_LEVELS)[number];

export const OWD_VALUES = ['Private', 'PublicReadOnly', 'PublicReadWrite', 'ControlledByParent'] as const;
export type Owd = (typeof OWD_VALUES)[number];
// OWDs that carry a baseline of their own; ControlledByParent defers to record.parentAccess instead.
export const OWD_WITH_BASELINE = ['Private', 'PublicReadOnly', 'PublicReadWrite'] as const;
export type OwdWithBaseline = (typeof OWD_WITH_BASELINE)[number];

export const SHARING_WANTS = ['read', 'edit', 'delete'] as const;
export type SharingWant = (typeof SHARING_WANTS)[number];

// What a sharing rule or manual share can hand out: never full (ownership, hierarchy and Modify All are the only paths).
export const SHARING_RULE_GRANTS = ['read', 'edit'] as const;
export type SharingRuleGrant = (typeof SHARING_RULE_GRANTS)[number];

export const SHARING_RULE_KINDS = ['owner', 'criteria'] as const;
export type SharingRuleKind = (typeof SHARING_RULE_KINDS)[number];

export const SHARING_TRACE_EFFECTS = ['gate', 'grant', 'none'] as const;
export type SharingTraceEffect = (typeof SHARING_TRACE_EFFECTS)[number];

export interface ObjectPerms {
  read: boolean;
  edit: boolean;
  delete: boolean;
  viewAll: boolean; // View All Records on this object
  modifyAll: boolean; // Modify All Records on this object
  viewAllData: boolean; // org-wide
  modifyAllData: boolean; // org-wide
}

export interface SharingRole {
  id: string;
  parentId?: string;
}

export interface SharingPermissionSet {
  id: string;
  perms: ObjectPerms;
}

export interface SharingUser {
  id: string;
  roleId?: string;
  profile: ObjectPerms;
  permissionSets: SharingPermissionSet[]; // merged inside the engine, never by the caller
}

export interface SharingRecord {
  id: string;
  ownerId: string; // a simulated user id, or anything else (a queue) that the hierarchy cannot climb from
  fields: Record<string, string | number | boolean>;
  parentAccess?: Access; // what the user has on the parent; read only when owd === 'ControlledByParent'
}

export interface SharingRuleMatch {
  ownerRoleId?: string; // kind 'owner': records owned by users in exactly this role
  field?: string; // kind 'criteria': record.fields[field] === equals
  equals?: string | number | boolean;
}

export interface SharingRuleShareWith {
  roleId?: string;
  roleAndSubordinates?: boolean; // with roleId: the role and every role beneath it
  userId?: string;
}

export interface SharingRule {
  id: string;
  kind: SharingRuleKind;
  match: SharingRuleMatch;
  shareWith: SharingRuleShareWith;
  access: SharingRuleGrant;
}

export interface ManualShare {
  userId: string;
  access: SharingRuleGrant;
}

export interface SharingQuestion {
  userId: string;
  wants: SharingWant;
}

export interface SharingInput {
  object: { owd: Owd; custom: boolean; grantAccessUsingHierarchies: boolean }; // toggle honoured only when custom === true
  roles: SharingRole[];
  users: SharingUser[];
  record: SharingRecord;
  sharingRules: SharingRule[];
  manualShares: ManualShare[];
  question: SharingQuestion;
}

export interface SharingRules {
  hierarchyAlwaysOnForStandard: boolean; // custom === false ignores grantAccessUsingHierarchies
  owdBaseline: Record<OwdWithBaseline, Access>; // what every internal user gets before any grant
  ownerAccess: Access; // what owning the record grants (and what the hierarchy passes upward)
  modifyAllAccess: Access; // Modify All Data / Modify All Records
  viewAllAccess: Access; // View All Data / View All Records ("read at minimum")
  maxGrantFromRules: SharingRuleGrant; // sharing rules and manual shares cap here
  deleteRequires: Access; // read needs read, edit needs edit, delete needs this
  notes?: Record<string, string>; // provenance / verify-before-teaching notes, never read by the engine
}

export interface SharingTraceStep {
  rule: string; // stable step name: object_permissions | modify_all | view_all | owner | owd | role_hierarchy | sharing_rule:<id> | manual_share | required_access
  effect: SharingTraceEffect; // gate: caps or requires; grant: raised access; none: no change
  access?: Access; // gate: the cap / requirement; grant: access after the grant; absent on none
  note: string;
}

export interface SharingResult {
  access: Access; // effective access: record-level access capped by the object CRUD gate
  granted: boolean;
  trace: SharingTraceStep[];
}

// ---------- schemas ----------

export const ObjectPermsSchema = z
  .object({
    read: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
    viewAll: z.boolean(),
    modifyAll: z.boolean(),
    viewAllData: z.boolean(),
    modifyAllData: z.boolean(),
  })
  .strict();

const AccessSchema = z.enum(ACCESS_LEVELS);
const RuleGrantSchema = z.enum(SHARING_RULE_GRANTS);

export const SharingRulesSchema = z
  .object({
    hierarchyAlwaysOnForStandard: z.boolean(),
    owdBaseline: z.object({ Private: AccessSchema, PublicReadOnly: AccessSchema, PublicReadWrite: AccessSchema }).strict(),
    ownerAccess: AccessSchema,
    modifyAllAccess: AccessSchema,
    viewAllAccess: AccessSchema,
    maxGrantFromRules: RuleGrantSchema,
    deleteRequires: AccessSchema,
    notes: z.record(z.string(), z.string().min(1)).optional(),
  })
  .strict();

export const SharingRuleSetSchema = ruleSetSchema('sharing', SharingRulesSchema);

const FieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const idSchema = z.string().min(1);

const SharingUserSchema = z
  .object({
    id: idSchema,
    roleId: idSchema.optional(),
    profile: ObjectPermsSchema,
    permissionSets: z.array(z.object({ id: idSchema, perms: ObjectPermsSchema }).strict()).max(SIM_CONFIG.sharing.maxPermissionSetsPerUser),
  })
  .strict();

const SharingRuleSchema = z
  .object({
    id: idSchema,
    kind: z.enum(SHARING_RULE_KINDS),
    match: z.object({ ownerRoleId: idSchema.optional(), field: idSchema.optional(), equals: FieldValueSchema.optional() }).strict(),
    shareWith: z.object({ roleId: idSchema.optional(), roleAndSubordinates: z.boolean().optional(), userId: idSchema.optional() }).strict(),
    access: RuleGrantSchema,
  })
  .strict();

export const SharingInputSchema = z
  .object({
    object: z.object({ owd: z.enum(OWD_VALUES), custom: z.boolean(), grantAccessUsingHierarchies: z.boolean() }).strict(),
    roles: z.array(z.object({ id: idSchema, parentId: idSchema.optional() }).strict()),
    users: z.array(SharingUserSchema).min(1).max(SIM_CONFIG.sharing.maxSimUsers),
    record: z.object({ id: idSchema, ownerId: idSchema, fields: z.record(z.string(), FieldValueSchema), parentAccess: AccessSchema.optional() }).strict(),
    sharingRules: z.array(SharingRuleSchema).max(SIM_CONFIG.sharing.maxRules),
    manualShares: z.array(z.object({ userId: idSchema, access: RuleGrantSchema }).strict()),
    question: z.object({ userId: idSchema, wants: z.enum(SHARING_WANTS) }).strict(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const roleIds = new Set<string>();
    input.roles.forEach((role, index) => {
      if (roleIds.has(role.id)) ctx.addIssue({ code: 'custom', message: `duplicate role id '${role.id}'`, path: ['roles', index, 'id'] });
      roleIds.add(role.id);
    });
    const parents = new Map(input.roles.map((role) => [role.id, role.parentId]));
    input.roles.forEach((role, index) => {
      if (role.parentId !== undefined && !roleIds.has(role.parentId)) {
        ctx.addIssue({ code: 'custom', message: `unknown parent role '${role.parentId}'`, path: ['roles', index, 'parentId'] });
        return;
      }
      const depth = roleDepth(role.id, parents);
      if (depth === undefined) {
        ctx.addIssue({ code: 'custom', message: `role '${role.id}' is part of a cycle`, path: ['roles', index, 'parentId'] });
      } else if (depth > SIM_CONFIG.sharing.maxRoleDepth) {
        ctx.addIssue({ code: 'custom', message: `role depth ${depth} exceeds ${SIM_CONFIG.sharing.maxRoleDepth}`, path: ['roles', index] });
      }
    });

    const userIds = new Set<string>();
    input.users.forEach((user, index) => {
      if (userIds.has(user.id)) ctx.addIssue({ code: 'custom', message: `duplicate user id '${user.id}'`, path: ['users', index, 'id'] });
      userIds.add(user.id);
      if (user.roleId !== undefined && !roleIds.has(user.roleId)) {
        ctx.addIssue({ code: 'custom', message: `unknown role '${user.roleId}'`, path: ['users', index, 'roleId'] });
      }
      const psIds = new Set<string>();
      user.permissionSets.forEach((ps, psIndex) => {
        if (psIds.has(ps.id)) ctx.addIssue({ code: 'custom', message: `duplicate permission set id '${ps.id}'`, path: ['users', index, 'permissionSets', psIndex, 'id'] });
        psIds.add(ps.id);
      });
    });

    const ruleIds = new Set<string>();
    input.sharingRules.forEach((rule, index) => {
      const path = ['sharingRules', index];
      if (ruleIds.has(rule.id)) ctx.addIssue({ code: 'custom', message: `duplicate sharing rule id '${rule.id}'`, path: [...path, 'id'] });
      ruleIds.add(rule.id);
      if (rule.kind === 'owner') {
        if (rule.match.ownerRoleId === undefined) ctx.addIssue({ code: 'custom', message: 'owner-based rules need match.ownerRoleId', path: [...path, 'match', 'ownerRoleId'] });
        else if (!roleIds.has(rule.match.ownerRoleId)) ctx.addIssue({ code: 'custom', message: `unknown role '${rule.match.ownerRoleId}'`, path: [...path, 'match', 'ownerRoleId'] });
      } else {
        if (rule.match.field === undefined) ctx.addIssue({ code: 'custom', message: 'criteria-based rules need match.field', path: [...path, 'match', 'field'] });
        if (rule.match.equals === undefined) ctx.addIssue({ code: 'custom', message: 'criteria-based rules need match.equals', path: [...path, 'match', 'equals'] });
      }
      const { roleId, roleAndSubordinates, userId } = rule.shareWith;
      if (roleId === undefined && userId === undefined) ctx.addIssue({ code: 'custom', message: 'shareWith needs a roleId or a userId', path: [...path, 'shareWith'] });
      if (roleId !== undefined && !roleIds.has(roleId)) ctx.addIssue({ code: 'custom', message: `unknown role '${roleId}'`, path: [...path, 'shareWith', 'roleId'] });
      if (roleAndSubordinates !== undefined && roleId === undefined) ctx.addIssue({ code: 'custom', message: 'roleAndSubordinates needs a roleId', path: [...path, 'shareWith', 'roleAndSubordinates'] });
      if (userId !== undefined && !userIds.has(userId)) ctx.addIssue({ code: 'custom', message: `unknown user '${userId}'`, path: [...path, 'shareWith', 'userId'] });
    });

    input.manualShares.forEach((share, index) => {
      if (!userIds.has(share.userId)) ctx.addIssue({ code: 'custom', message: `unknown user '${share.userId}'`, path: ['manualShares', index, 'userId'] });
    });
    if (!userIds.has(input.question.userId)) {
      ctx.addIssue({ code: 'custom', message: `unknown user '${input.question.userId}'`, path: ['question', 'userId'] });
    }
  });

// Depth of a role counted from its root (root = 1); undefined when the parent chain loops.
function roleDepth(roleId: string, parents: Map<string, string | undefined>): number | undefined {
  let depth = 1;
  let current = parents.get(roleId);
  while (current !== undefined) {
    depth += 1;
    if (depth > parents.size) return undefined;
    current = parents.get(current);
  }
  return depth;
}

// ---------- access helpers ----------

function rank(access: Access): number {
  return ACCESS_LEVELS.indexOf(access);
}
function maxAccess(a: Access, b: Access): Access {
  return rank(a) >= rank(b) ? a : b;
}
function minAccess(a: Access, b: Access): Access {
  return rank(a) <= rank(b) ? a : b;
}

const CRUD_FLAGS = ['read', 'edit', 'delete'] as const;
type CrudFlag = (typeof CRUD_FLAGS)[number];

// Modify All implies read/edit/delete and View All implies read, exactly as Setup auto-checks those boxes.
function implies(perms: ObjectPerms, flag: CrudFlag): boolean {
  switch (flag) {
    case 'read':
      return perms.read || perms.viewAll || perms.viewAllData || perms.modifyAll || perms.modifyAllData;
    case 'edit':
      return perms.edit || perms.modifyAll || perms.modifyAllData;
    case 'delete':
      return perms.delete || perms.modifyAll || perms.modifyAllData;
  }
}

// The first grantor (profile, then permission sets in order) whose own flags satisfy `test`.
function grantorOf(user: SharingUser, test: (perms: ObjectPerms) => boolean): string | undefined {
  if (test(user.profile)) return 'profile';
  const ps = user.permissionSets.find((set) => test(set.perms));
  return ps ? `permission set '${ps.id}'` : undefined;
}

function mergePerms(user: SharingUser): ObjectPerms {
  const merged: ObjectPerms = { ...user.profile };
  for (const set of user.permissionSets) {
    merged.read = merged.read || set.perms.read;
    merged.edit = merged.edit || set.perms.edit;
    merged.delete = merged.delete || set.perms.delete;
    merged.viewAll = merged.viewAll || set.perms.viewAll;
    merged.modifyAll = merged.modifyAll || set.perms.modifyAll;
    merged.viewAllData = merged.viewAllData || set.perms.viewAllData;
    merged.modifyAllData = merged.modifyAllData || set.perms.modifyAllData;
  }
  return merged;
}

// ---------- role helpers ----------

// Strict ancestors of a role, nearest first. Bounded by the role count so a malformed (cyclic) input still terminates.
function ancestorsOf(roleId: string | undefined, parents: Map<string, string | undefined>): string[] {
  const chain: string[] = [];
  let current = roleId === undefined ? undefined : parents.get(roleId);
  while (current !== undefined && chain.length < parents.size) {
    chain.push(current);
    current = parents.get(current);
  }
  return chain;
}

function isAbove(roleId: string, ofRoleId: string, parents: Map<string, string | undefined>): boolean {
  return ancestorsOf(ofRoleId, parents).includes(roleId);
}

const OWD_LABEL: Record<Owd, string> = {
  Private: 'Private',
  PublicReadOnly: 'Public Read Only',
  PublicReadWrite: 'Public Read/Write',
  ControlledByParent: 'Controlled by Parent',
};

function describeShareWith(target: SharingRuleShareWith): string {
  if (target.userId !== undefined) return `user '${target.userId}'`;
  if (target.roleAndSubordinates) return `role '${target.roleId}' and subordinates`;
  return `role '${target.roleId}'`;
}

function formatValue(value: string | number | boolean | undefined): string {
  return value === undefined ? 'nothing' : typeof value === 'string' ? `'${value}'` : String(value);
}

// ---------- engine ----------

export function simulate(input: SharingInput, ruleSet: RuleSet<SharingRules>): SharingResult {
  const rules = ruleSet.rules;
  const trace: SharingTraceStep[] = [];
  const user = input.users.find((u) => u.id === input.question.userId);
  if (!user) {
    // SharingInputSchema rejects this; the engine still answers rather than throwing on a hand-built input.
    trace.push({ rule: 'object_permissions', effect: 'gate', access: 'none', note: `User '${input.question.userId}' is not one of the simulated users.` });
    return { access: 'none', granted: false, trace };
  }
  const merged = mergePerms(user);
  const wants = input.question.wants;

  // 1. Object CRUD gate: runs first; no object Read means sharing is never consulted.
  if (!implies(merged, 'read')) {
    trace.push({
      rule: 'object_permissions',
      effect: 'gate',
      access: 'none',
      note: 'No object Read on the profile or any permission set: the record is invisible whatever sharing says.',
    });
    return { access: 'none', granted: false, trace };
  }
  const ceiling: Access = implies(merged, 'delete') ? 'full' : implies(merged, 'edit') ? 'edit' : 'read';
  const grantors = CRUD_FLAGS.map((flag) => {
    const label = flag.charAt(0).toUpperCase() + flag.slice(1);
    return `${label}: ${grantorOf(user, (perms) => implies(perms, flag)) ?? 'not granted'}`;
  });
  trace.push({
    rule: 'object_permissions',
    effect: 'gate',
    access: ceiling,
    note: `${grantors.join('; ')}. Object permissions cap record-level access at ${ceiling}.`,
  });

  let access: Access = 'none';
  const grant = (rule: string, level: Access, note: string): void => {
    if (level !== 'none' && rank(level) > rank(access)) {
      access = level;
      trace.push({ rule, effect: 'grant', access, note });
    } else if (level === 'none') {
      trace.push({ rule, effect: 'none', note });
    } else {
      trace.push({ rule, effect: 'none', note: `${note} No change: access is already ${access}.` });
    }
  };
  const none = (rule: string, note: string): void => {
    trace.push({ rule, effect: 'none', note });
  };

  // 2. Modify All Data / Modify All Records override sharing.
  if (merged.modifyAllData) {
    grant('modify_all', rules.modifyAllAccess, `Modify All Data via ${grantorOf(user, (p) => p.modifyAllData)} overrides sharing: ${rules.modifyAllAccess} access to every record in the org.`);
  } else if (merged.modifyAll) {
    grant('modify_all', rules.modifyAllAccess, `Modify All Records on this object via ${grantorOf(user, (p) => p.modifyAll)} overrides sharing: ${rules.modifyAllAccess} access to every record of the object.`);
  } else {
    none('modify_all', 'No Modify All Data or Modify All Records: sharing decides.');
  }

  // 3. View All Data / View All Records: read at minimum.
  if (merged.viewAllData) {
    grant('view_all', rules.viewAllAccess, `View All Data via ${grantorOf(user, (p) => p.viewAllData)} overrides sharing: at least ${rules.viewAllAccess} on every record in the org.`);
  } else if (merged.viewAll) {
    grant('view_all', rules.viewAllAccess, `View All Records on this object via ${grantorOf(user, (p) => p.viewAll)} overrides sharing: at least ${rules.viewAllAccess} on every record of the object.`);
  } else {
    none('view_all', 'No View All Data or View All Records: sharing decides.');
  }

  // 4. Ownership.
  if (input.record.ownerId === user.id) {
    grant('owner', rules.ownerAccess, `User '${user.id}' owns the record: owners get ${rules.ownerAccess} access.`);
  } else {
    none('owner', `Record is owned by '${input.record.ownerId}', not '${user.id}'.`);
  }

  // 5. OWD baseline; ControlledByParent defers to the parent.
  const owd = input.object.owd;
  const controlledByParent = owd === 'ControlledByParent';
  if (controlledByParent) {
    const parentAccess = input.record.parentAccess;
    if (parentAccess === undefined) {
      none('owd', `OWD ${OWD_LABEL[owd]} but no parentAccess was supplied: treated as none.`);
    } else {
      grant('owd', parentAccess, `OWD ${OWD_LABEL[owd]}: the record inherits the user's ${parentAccess} access on its parent.`);
    }
  } else {
    const baseline = rules.owdBaseline[owd];
    if (baseline === 'none') {
      none('owd', `OWD ${OWD_LABEL[owd]}: no baseline; only ownership, the role hierarchy, sharing rules and shares open the record.`);
    } else {
      grant('owd', baseline, `OWD ${OWD_LABEL[owd]}: every internal user gets ${baseline} as the baseline.`);
    }
  }

  // 6. Role hierarchy: roles above the owner get owner-level access; forced on for standard objects.
  const parents = new Map(input.roles.map((role) => [role.id, role.parentId]));
  const forcedOn = !input.object.custom && rules.hierarchyAlwaysOnForStandard && !input.object.grantAccessUsingHierarchies;
  const hierarchyOn = input.object.custom ? input.object.grantAccessUsingHierarchies : rules.hierarchyAlwaysOnForStandard || input.object.grantAccessUsingHierarchies;
  const prefix = forcedOn ? 'Grant Access Using Hierarchies is always on for standard objects; the toggle (off) is ignored. ' : '';
  const owner = input.users.find((u) => u.id === input.record.ownerId);
  const ownerRoleId = owner?.roleId;
  if (!hierarchyOn) {
    none('role_hierarchy', 'Grant Access Using Hierarchies is off for this custom object: roles above the owner get nothing from the hierarchy.');
  } else if (user.roleId === undefined) {
    none('role_hierarchy', `${prefix}User '${user.id}' has no role, so nothing reaches them through the hierarchy.`);
  } else if (ownerRoleId === undefined) {
    none('role_hierarchy', `${prefix}The owner '${input.record.ownerId}' has no role (or is a queue), so nothing flows up the hierarchy.`);
  } else if (isAbove(user.roleId, ownerRoleId, parents)) {
    grant('role_hierarchy', rules.ownerAccess, `${prefix}Role '${user.roleId}' is above the owner's role '${ownerRoleId}': the hierarchy grants owner-level access (${rules.ownerAccess}).`);
  } else {
    none('role_hierarchy', `${prefix}Role '${user.roleId}' is not above the owner's role '${ownerRoleId}': nothing from the hierarchy.`);
  }

  // 7. Sharing rules: only widen, capped at maxGrantFromRules.
  for (const rule of input.sharingRules) {
    const step = `sharing_rule:${rule.id}`;
    if (controlledByParent) {
      none(step, 'Not evaluated: a Controlled-by-Parent object has no sharing rules of its own.');
      continue;
    }
    let matches: boolean;
    let noMatchNote: string;
    if (rule.kind === 'owner') {
      matches = rule.match.ownerRoleId !== undefined && ownerRoleId === rule.match.ownerRoleId;
      noMatchNote = `Owner-based rule for records owned by role '${rule.match.ownerRoleId}': the owner's role is ${ownerRoleId === undefined ? 'none' : `'${ownerRoleId}'`}, no match.`;
    } else {
      const field = rule.match.field ?? '';
      const value = input.record.fields[field];
      matches = rule.match.field !== undefined && rule.match.equals !== undefined && value === rule.match.equals;
      noMatchNote = `Criteria rule ${field} = ${formatValue(rule.match.equals)}: the record has ${field} = ${formatValue(value)}, no match.`;
    }
    if (!matches) {
      none(step, noMatchNote);
      continue;
    }
    const target = rule.shareWith;
    const sharedWithUser =
      (target.userId !== undefined && target.userId === user.id) ||
      (target.roleId !== undefined &&
        user.roleId !== undefined &&
        (user.roleId === target.roleId || (target.roleAndSubordinates === true && isAbove(target.roleId, user.roleId, parents))));
    if (!sharedWithUser) {
      none(step, `Matches the record but is shared with ${describeShareWith(target)}, which does not include user '${user.id}'.`);
      continue;
    }
    const granted = minAccess(rule.access, rules.maxGrantFromRules);
    const capNote = granted !== rule.access ? ` (rule access ${rule.access} capped at ${rules.maxGrantFromRules})` : '';
    grant(step, granted, `Matches the record and is shared with ${describeShareWith(target)}: grants ${granted}${capNote}.`);
  }

  // 8. Manual shares: only widen, capped at maxGrantFromRules.
  const shares = input.manualShares.filter((share) => share.userId === user.id);
  if (controlledByParent) {
    none('manual_share', 'Not evaluated: detail records under Controlled by Parent cannot be shared manually.');
  } else if (shares.length === 0) {
    none('manual_share', `No manual share for user '${user.id}'.`);
  } else {
    const best = shares.reduce<Access>((acc, share) => maxAccess(acc, minAccess(share.access, rules.maxGrantFromRules)), 'none');
    grant('manual_share', best, `Manual share grants ${best} to user '${user.id}'; manual shares never exceed ${rules.maxGrantFromRules}.`);
  }

  // 9. What the request needs, and the CRUD cap applied to what sharing produced.
  const required: Access = wants === 'delete' ? rules.deleteRequires : wants;
  const effective = minAccess(access, ceiling);
  const capped = effective !== access;
  const granted = rank(effective) >= rank(required);
  trace.push({
    rule: 'required_access',
    effect: 'gate',
    access: required,
    note: `Wants ${wants}: needs ${required}. Record-level access is ${access}${capped ? `, capped at ${ceiling} by object permissions` : ''}: ${granted ? 'granted' : 'denied'}.`,
  });

  return { access: effective, granted, trace };
}
