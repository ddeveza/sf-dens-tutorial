// Save order of execution as documented for Summer '26 (API 67.0), Apex Developer Guide "Triggers and Order of
// Execution" (source id dev-apex-ooe; the source row cites the current-version URL and records docVersion). The
// 20-step list is unchanged across Spring '26, Summer '26 and Winter '27, so one file serves all three until a
// release moves a step. Validated against OoERuleSetSchema on import.
import { OoERuleSetSchema } from '../../../lib/simulations/order-of-execution/index.ts';
import type { OoEOperation, OoERules, OoEStageRule } from '../../../lib/simulations/order-of-execution/index.ts';
import type { RuleSet } from '../../../lib/simulations/rule-set.ts';

const every: OoEOperation[] = ['insert', 'update', 'delete', 'undelete'];
const insertUpdate: OoEOperation[] = ['insert', 'update'];

// Step numbers follow the guide. `always` marks structural steps that run on every save regardless of what the
// object has configured. Delete-triggered record-triggered flows are not modelled in this set (open item): delete
// runs before triggers, the save, after triggers and roll-ups only.
const stages: OoEStageRule[] = [
  { id: 'load', phase: 'pre-save', appliesTo: every, always: true }, // 1 load the record / initialise from the request
  { id: 'systemValidation', phase: 'pre-save', appliesTo: insertUpdate, always: true }, // 2 request values + request-type validation
  { id: 'beforeSaveFlow', phase: 'pre-save', appliesTo: insertUpdate }, // 3 before-save record-triggered flows (in memory, no extra DML)
  { id: 'beforeTrigger', phase: 'pre-save', appliesTo: ['insert', 'update', 'delete'] }, // 4 before triggers
  { id: 'customValidation', phase: 'pre-save', appliesTo: insertUpdate }, // 5 system + custom validation rules
  { id: 'duplicateRules', phase: 'pre-save', appliesTo: insertUpdate }, // 6 duplicate rules
  { id: 'saveNoCommit', phase: 'save', appliesTo: every, always: true }, // 7 save to the database, no commit yet
  { id: 'afterTrigger', phase: 'post-save', appliesTo: every }, // 8 after triggers (after undelete exists, before undelete does not)
  { id: 'assignmentRules', phase: 'post-save', appliesTo: insertUpdate }, // 9 assignment rules
  { id: 'autoResponseRules', phase: 'post-save', appliesTo: ['insert'] }, // 10 auto-response rules (creation only)
  { id: 'workflowRules', phase: 'post-save', appliesTo: insertUpdate }, // 11 workflow rules (field update re-fires update triggers once)
  { id: 'escalationRules', phase: 'post-save', appliesTo: insertUpdate }, // 12 escalation rules
  { id: 'workflowLaunchedFlows', phase: 'post-save', appliesTo: insertUpdate }, // 13 processes / flows launched by workflow
  { id: 'afterSaveFlow', phase: 'post-save', appliesTo: insertUpdate }, // 14 after-save record-triggered flows
  { id: 'entitlementRules', phase: 'post-save', appliesTo: insertUpdate }, // 15 entitlement rules
  { id: 'rollupSummary', phase: 'post-save', appliesTo: every }, // 16 roll-up summary to the parent (delete/undelete recalc too)
  { id: 'grandparentRollup', phase: 'post-save', appliesTo: every }, // 17 grandparent roll-up
  { id: 'criteriaSharing', phase: 'post-save', appliesTo: insertUpdate }, // 18 criteria-based sharing evaluation
  { id: 'commit', phase: 'commit', appliesTo: every, always: true }, // 19 commit
  { id: 'postCommit', phase: 'post-commit', appliesTo: every, always: true }, // 20 post-commit logic (email, async jobs)
];

const rules: OoERules = {
  stages,
  reruns: [
    {
      // A workflow field update fires before-update and after-update triggers one more time (and only one more
      // time), with standard validation and the save; custom validation, flows, duplicate rules, processes and
      // escalation rules do not run again, and a recursive save skips steps 9-17. Trigger.old keeps pre-workflow values.
      cause: 'workflowFieldUpdate',
      rerun: ['systemValidation', 'beforeTrigger', 'saveNoCommit', 'afterTrigger'],
      skip: [
        'beforeSaveFlow',
        'customValidation',
        'duplicateRules',
        'assignmentRules',
        'autoResponseRules',
        'workflowRules',
        'escalationRules',
        'workflowLaunchedFlows',
        'afterSaveFlow',
        'entitlementRules',
        'rollupSummary',
        'grandparentRollup',
      ],
      maxCount: 1,
    },
  ],
};

const set: RuleSet<OoERules> = {
  id: 'order-of-execution@summer-26',
  simulation: 'order-of-execution',
  release: 'summer-26',
  apiVersion: '67.0',
  sourceIds: ['dev-apex-ooe'],
  verification: {
    release: 'summer-26',
    apiVersion: '67.0',
    docVersion: "Winter '27 (Latest); step list identical in Summer '26 (262.0) and Spring '26 (260.0)",
    lastVerified: '2026-09-04',
    status: 'verified',
  },
  rules,
};

OoERuleSetSchema.parse(set);

export const summer26 = set;
