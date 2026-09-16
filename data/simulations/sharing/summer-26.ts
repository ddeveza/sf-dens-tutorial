// Sharing rules as documented for Summer '26 (API 67.0): "Sharing and Record Access Features", "Control Who Sees
// What", the View All / Modify All overview and Object Permissions help topics, plus the Architect paper "Designing
// Record Access for Enterprise Scale" (source ids below, all verified 2026-09-04). None of these values changed in
// Summer '26; the set exists so a lesson can pin it and so a future release that changes one adds a new file.
// Validated against SharingRuleSetSchema on import.
import { SharingRuleSetSchema } from '../../../lib/simulations/sharing/index.ts';
import type { SharingRules } from '../../../lib/simulations/sharing/index.ts';
import type { RuleSet } from '../../../lib/simulations/rule-set.ts';

const rules: SharingRules = {
  // Grant Access Using Hierarchies is configurable only for custom objects; standard objects always grant upward.
  hierarchyAlwaysOnForStandard: true,
  // OWD locks to the most restrictive level first; everything after only widens.
  owdBaseline: { Private: 'none', PublicReadOnly: 'read', PublicReadWrite: 'edit' },
  ownerAccess: 'full',
  // Modify All Data (org-wide) and Modify All Records (per object) override sharing entirely.
  modifyAllAccess: 'full',
  // View All Data (org-wide) and View All Records (per object) grant read on every record; never edit.
  viewAllAccess: 'read',
  // Sharing rules and manual shares hand out Read Only or Read/Write; Full Access comes only from ownership,
  // the role hierarchy or Modify All.
  maxGrantFromRules: 'edit',
  // Delete (and transfer, share) needs Full Access on the record plus the Delete object permission.
  deleteRequires: 'full',
  notes: {
    crudGate: 'Object permissions respect sharing but win over it: no object Read makes the record invisible whatever sharing says, and Public Read/Write never gives edit to a read-only profile (help-object-perms, help-control-who-sees-what).',
    viewAllModifyAll: "View All Records / Modify All Records were renamed from View All / Modify All (Spring '25, rn-view-all-rename). Neither overrides field-level security, which this simulator does not model (World 3).",
    controlledByParent: 'Controlled by Parent objects (master-detail children) have no owner of their own, no sharing rules and no manual shares; the engine reads record.parentAccess instead.',
    outOfScope: 'Teams, queues, territories, restriction and scoping rules, Apex managed sharing and external users are not modelled in this release of the simulator.',
  },
};

const set: RuleSet<SharingRules> = {
  id: 'sharing@summer-26',
  simulation: 'sharing',
  release: 'summer-26',
  apiVersion: '67.0',
  sourceIds: ['help-sharing-features', 'help-control-who-sees-what', 'help-view-all-modify-all', 'help-object-perms', 'dev-pdf-draes'],
  verification: {
    release: 'summer-26',
    apiVersion: '67.0',
    docVersion: "Summer '26 (API 67.0); help topics as fetched 2026-09-04, DRAES PDF (latest)",
    lastVerified: '2026-09-04',
    status: 'verified',
  },
  rules,
};

SharingRuleSetSchema.parse(set);

export const summer26 = set;
