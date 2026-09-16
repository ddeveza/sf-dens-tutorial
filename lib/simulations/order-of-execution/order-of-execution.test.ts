import { describe, expect, it } from 'vitest';
import type { RuleSet } from '../rule-set.ts';
import { OOE_OPERATIONS, OoEInputSchema, OoERuleSetSchema, OoERulesSchema, STAGE_IDS, scoreOrdering, simulate } from './index.ts';
import type { OoEInput, OoERules, OoEStageRule, StageId } from './index.ts';

// Fixture mirrors the canonical 20-stage list; the real rule set lives in data/simulations/order-of-execution.
const all = ['insert', 'update', 'delete', 'undelete'] as const;
const stages: OoEStageRule[] = [
  { id: 'load', phase: 'pre-save', appliesTo: [...all], always: true },
  { id: 'systemValidation', phase: 'pre-save', appliesTo: ['insert', 'update'], always: true },
  { id: 'beforeSaveFlow', phase: 'pre-save', appliesTo: ['insert', 'update'] },
  { id: 'beforeTrigger', phase: 'pre-save', appliesTo: ['insert', 'update', 'delete'] },
  { id: 'customValidation', phase: 'pre-save', appliesTo: ['insert', 'update'] },
  { id: 'duplicateRules', phase: 'pre-save', appliesTo: ['insert', 'update'] },
  { id: 'saveNoCommit', phase: 'save', appliesTo: [...all], always: true },
  { id: 'afterTrigger', phase: 'post-save', appliesTo: [...all] },
  { id: 'assignmentRules', phase: 'post-save', appliesTo: ['insert', 'update'] },
  { id: 'autoResponseRules', phase: 'post-save', appliesTo: ['insert'] },
  { id: 'workflowRules', phase: 'post-save', appliesTo: ['insert', 'update'] },
  { id: 'escalationRules', phase: 'post-save', appliesTo: ['insert', 'update'] },
  { id: 'workflowLaunchedFlows', phase: 'post-save', appliesTo: ['insert', 'update'] },
  { id: 'afterSaveFlow', phase: 'post-save', appliesTo: ['insert', 'update'] },
  { id: 'entitlementRules', phase: 'post-save', appliesTo: ['insert', 'update'] },
  { id: 'rollupSummary', phase: 'post-save', appliesTo: [...all] },
  { id: 'grandparentRollup', phase: 'post-save', appliesTo: [...all] },
  { id: 'criteriaSharing', phase: 'post-save', appliesTo: ['insert', 'update'] },
  { id: 'commit', phase: 'commit', appliesTo: [...all], always: true },
  { id: 'postCommit', phase: 'post-commit', appliesTo: [...all], always: true },
];

const rules: OoERules = {
  stages,
  reruns: [
    {
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

const ruleSet: RuleSet<OoERules> = {
  id: 'order-of-execution@summer-26',
  simulation: 'order-of-execution',
  release: 'summer-26',
  apiVersion: '67.0',
  sourceIds: ['dev-apex-ooe'],
  verification: { release: 'summer-26', apiVersion: '67.0', docVersion: 'test', lastVerified: '2026-09-04', status: 'verified' },
  rules,
};

function input(partial: Partial<OoEInput>): OoEInput {
  return { operation: 'insert', configured: {}, workflowDoesFieldUpdate: false, learnerOrder: [], ...partial };
}

describe('order-of-execution simulate', () => {
  it('structural stages always run even when nothing is configured', () => {
    const result = simulate(input({}), ruleSet);
    expect(result.actualOrder).toEqual(['load', 'systemValidation', 'saveNoCommit', 'commit', 'postCommit']);
    expect(result.reruns).toEqual([]);
  });

  it('configured automations appear in canonical order regardless of the key order; unspecified or false => absent', () => {
    const result = simulate(
      input({ configured: { afterSaveFlow: true, beforeTrigger: true, criteriaSharing: true, afterTrigger: true, duplicateRules: false } }),
      ruleSet,
    );
    expect(result.actualOrder).toEqual([
      'load',
      'systemValidation',
      'beforeTrigger',
      'saveNoCommit',
      'afterTrigger',
      'afterSaveFlow',
      'criteriaSharing',
      'commit',
      'postCommit',
    ]);
  });

  it('delete skips validation, flows and workflow even when configured, and ignores the field-update flag', () => {
    const result = simulate(
      input({
        operation: 'delete',
        configured: { beforeSaveFlow: true, beforeTrigger: true, customValidation: true, afterTrigger: true, workflowRules: true, rollupSummary: true },
        workflowDoesFieldUpdate: true,
      }),
      ruleSet,
    );
    expect(result.actualOrder).toEqual(['load', 'beforeTrigger', 'saveNoCommit', 'afterTrigger', 'rollupSummary', 'commit', 'postCommit']);
    expect(result.reruns).toEqual([]);
  });

  it('undelete fires only after triggers and roll-ups', () => {
    const result = simulate(
      input({ operation: 'undelete', configured: { beforeTrigger: true, afterTrigger: true, customValidation: true, rollupSummary: true, grandparentRollup: true } }),
      ruleSet,
    );
    expect(result.actualOrder).toEqual(['load', 'saveNoCommit', 'afterTrigger', 'rollupSummary', 'grandparentRollup', 'commit', 'postCommit']);
  });

  it('a workflow field update re-runs the rerun stages once, right after workflowRules, skipping the skip list', () => {
    const result = simulate(
      input({
        operation: 'update',
        configured: { beforeSaveFlow: true, beforeTrigger: true, customValidation: true, afterTrigger: true, workflowRules: true, afterSaveFlow: true, rollupSummary: true },
        workflowDoesFieldUpdate: true,
      }),
      ruleSet,
    );
    expect(result.actualOrder).toEqual([
      'load',
      'systemValidation',
      'beforeSaveFlow',
      'beforeTrigger',
      'customValidation',
      'saveNoCommit',
      'afterTrigger',
      'workflowRules',
      'systemValidation',
      'beforeTrigger',
      'saveNoCommit',
      'afterTrigger',
      'afterSaveFlow',
      'rollupSummary',
      'commit',
      'postCommit',
    ]);
    expect(result.reruns).toEqual([
      { stage: 'systemValidation', cause: 'workflowFieldUpdate', iteration: 1 },
      { stage: 'beforeTrigger', cause: 'workflowFieldUpdate', iteration: 1 },
      { stage: 'saveNoCommit', cause: 'workflowFieldUpdate', iteration: 1 },
      { stage: 'afterTrigger', cause: 'workflowFieldUpdate', iteration: 1 },
    ]);
  });

  it('the rerun only includes rerun stages that are actually configured for this object', () => {
    const result = simulate(input({ configured: { workflowRules: true, afterTrigger: true }, workflowDoesFieldUpdate: true }), ruleSet);
    expect(result.actualOrder).toEqual([
      'load',
      'systemValidation',
      'saveNoCommit',
      'afterTrigger',
      'workflowRules',
      'systemValidation',
      'saveNoCommit',
      'afterTrigger',
      'commit',
      'postCommit',
    ]);
    expect(result.reruns.map((r) => r.stage)).toEqual(['systemValidation', 'saveNoCommit', 'afterTrigger']);
  });

  it('no rerun when workflowRules is not configured or the flag is false', () => {
    const noWorkflow = simulate(input({ configured: { beforeTrigger: true, afterTrigger: true }, workflowDoesFieldUpdate: true }), ruleSet);
    const noFieldUpdate = simulate(input({ configured: { beforeTrigger: true, afterTrigger: true, workflowRules: true } }), ruleSet);
    expect(noWorkflow.actualOrder).toEqual(['load', 'systemValidation', 'beforeTrigger', 'saveNoCommit', 'afterTrigger', 'commit', 'postCommit']);
    expect(noWorkflow.reruns).toEqual([]);
    expect(noFieldUpdate.actualOrder).toEqual(['load', 'systemValidation', 'beforeTrigger', 'saveNoCommit', 'afterTrigger', 'workflowRules', 'commit', 'postCommit']);
    expect(noFieldUpdate.reruns).toEqual([]);
  });

  it('maxCount > 1 re-runs that many passes with increasing iteration numbers', () => {
    const twice: RuleSet<OoERules> = { ...ruleSet, rules: { ...rules, reruns: [{ ...rules.reruns[0], maxCount: 2 }] } };
    const result = simulate(input({ configured: { beforeTrigger: true, workflowRules: true }, workflowDoesFieldUpdate: true }), twice);
    expect(result.actualOrder).toEqual([
      'load',
      'systemValidation',
      'beforeTrigger',
      'saveNoCommit',
      'workflowRules',
      'systemValidation',
      'beforeTrigger',
      'saveNoCommit',
      'systemValidation',
      'beforeTrigger',
      'saveNoCommit',
      'commit',
      'postCommit',
    ]);
    expect(result.reruns.map((r) => r.iteration)).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('skip wins over rerun if a rule set lists a stage in both (defensive)', () => {
    const odd: RuleSet<OoERules> = {
      ...ruleSet,
      rules: { ...rules, reruns: [{ cause: 'workflowFieldUpdate', rerun: ['beforeTrigger', 'afterTrigger'], skip: ['afterTrigger'], maxCount: 1 }] },
    };
    const result = simulate(input({ configured: { beforeTrigger: true, afterTrigger: true, workflowRules: true }, workflowDoesFieldUpdate: true }), odd);
    expect(result.reruns.map((r) => r.stage)).toEqual(['beforeTrigger']);
  });

  it('diff lists every index where the learner order departs from the actual order; got is omitted when the learner list is shorter', () => {
    const learnerOrder: StageId[] = ['load', 'systemValidation', 'customValidation', 'beforeTrigger', 'saveNoCommit'];
    const result = simulate(input({ configured: { beforeTrigger: true, customValidation: true, afterTrigger: true }, learnerOrder }), ruleSet);
    expect(result.actualOrder).toEqual(['load', 'systemValidation', 'beforeTrigger', 'customValidation', 'saveNoCommit', 'afterTrigger', 'commit', 'postCommit']);
    expect(result.diff).toEqual([
      { index: 2, expected: 'beforeTrigger', got: 'customValidation' },
      { index: 3, expected: 'customValidation', got: 'beforeTrigger' },
      { index: 5, expected: 'afterTrigger' },
      { index: 6, expected: 'commit' },
      { index: 7, expected: 'postCommit' },
    ]);
    expect(result.diff.every((d) => !('got' in d) || d.got !== undefined)).toBe(true);
  });

  it('score: exact order => 100 and an empty diff', () => {
    const learnerOrder: StageId[] = ['load', 'systemValidation', 'beforeTrigger', 'saveNoCommit', 'afterTrigger', 'commit', 'postCommit'];
    const result = simulate(input({ configured: { beforeTrigger: true, afterTrigger: true }, learnerOrder }), ruleSet);
    expect(result.diff).toEqual([]);
    expect(result.score).toBe(100);
  });

  it('score: one adjacent swap in 8 stages => LCS 7/8 => 88', () => {
    const learnerOrder: StageId[] = ['load', 'systemValidation', 'customValidation', 'beforeTrigger', 'saveNoCommit', 'afterTrigger', 'commit', 'postCommit'];
    const result = simulate(input({ configured: { beforeTrigger: true, customValidation: true, afterTrigger: true }, learnerOrder }), ruleSet);
    expect(result.score).toBe(88);
  });

  it('score: a learner who misses the re-fire keeps subsequence credit only', () => {
    const learnerOrder: StageId[] = ['load', 'systemValidation', 'beforeTrigger', 'saveNoCommit', 'afterTrigger', 'workflowRules', 'commit', 'postCommit'];
    const result = simulate(input({ configured: { beforeTrigger: true, afterTrigger: true, workflowRules: true }, workflowDoesFieldUpdate: true, learnerOrder }), ruleSet);
    expect(result.actualOrder).toHaveLength(12);
    expect(result.score).toBe(Math.round((8 / 12) * 100));
  });
});

describe('scoreOrdering (LCS ratio; same algorithm as lib/assessments scoreOrdering)', () => {
  it('exact => 100, empty vs empty => 100, disjoint => 0', () => {
    expect(scoreOrdering(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(100);
    expect(scoreOrdering([], [])).toBe(100);
    expect(scoreOrdering(['x', 'y'], ['a', 'b'])).toBe(0);
    expect(scoreOrdering([], ['a'])).toBe(0);
  });

  it('uses the longer of the two lengths so missing and extra items both cost', () => {
    expect(scoreOrdering(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(50);
    expect(scoreOrdering(['a', 'b', 'c', 'd'], ['a', 'b'])).toBe(50);
    expect(scoreOrdering(['b', 'a', 'c'], ['a', 'b', 'c'])).toBe(67);
  });

  it('handles repeated items (reruns) as ordinary LCS symbols', () => {
    expect(scoreOrdering(['a', 'b', 'a', 'b'], ['a', 'b', 'a', 'b'])).toBe(100);
    expect(scoreOrdering(['a', 'b'], ['a', 'b', 'a', 'b'])).toBe(50);
  });
});

describe('order-of-execution schemas', () => {
  it('OoERulesSchema accepts the fixture and OoERuleSetSchema the rule set', () => {
    expect(OoERulesSchema.safeParse(rules).success).toBe(true);
    expect(OoERuleSetSchema.safeParse(ruleSet).success).toBe(true);
    expect(OoERuleSetSchema.safeParse({ ...ruleSet, id: 'order-of-execution@winter-27' }).success).toBe(false);
  });

  it('OoERulesSchema rejects duplicate stage ids, unknown ids, rerun ids not in stages, overlapping rerun/skip and maxCount < 1', () => {
    expect(OoERulesSchema.safeParse({ ...rules, stages: [...stages, stages[0]] }).success).toBe(false);
    expect(OoERulesSchema.safeParse({ ...rules, stages: [{ ...stages[0], id: 'nope' }, ...stages.slice(1)] }).success).toBe(false);
    expect(OoERulesSchema.safeParse({ ...rules, stages: stages.filter((s) => s.id !== 'afterTrigger') }).success).toBe(false);
    expect(OoERulesSchema.safeParse({ ...rules, reruns: [{ ...rules.reruns[0], skip: ['beforeTrigger'] }] }).success).toBe(false);
    expect(OoERulesSchema.safeParse({ ...rules, reruns: [{ ...rules.reruns[0], maxCount: 0 }] }).success).toBe(false);
    expect(OoERulesSchema.safeParse({ ...rules, stages: stages.filter((s) => s.id !== 'workflowRules') }).success).toBe(false);
    expect(OoERulesSchema.safeParse({ ...rules, stages: [{ ...stages[0], phase: 'later' }, ...stages.slice(1)] }).success).toBe(false);
    expect(OoERulesSchema.safeParse({ ...rules, stages: [{ ...stages[0], appliesTo: [] }, ...stages.slice(1)] }).success).toBe(false);
  });

  it('OoEInputSchema rejects unknown stage ids and operations', () => {
    const ok = { operation: 'insert', configured: { beforeTrigger: true }, workflowDoesFieldUpdate: false, learnerOrder: ['load', 'commit'] };
    expect(OoEInputSchema.safeParse(ok).success).toBe(true);
    expect(OoEInputSchema.safeParse({ ...ok, configured: { nope: true } }).success).toBe(false);
    expect(OoEInputSchema.safeParse({ ...ok, learnerOrder: ['load', 'nope'] }).success).toBe(false);
    expect(OoEInputSchema.safeParse({ ...ok, operation: 'upsert' }).success).toBe(false);
  });

  it('exports the canonical 20 stage ids and the four operations', () => {
    expect(STAGE_IDS).toHaveLength(20);
    expect(STAGE_IDS[0]).toBe('load');
    expect(STAGE_IDS[19]).toBe('postCommit');
    expect(OOE_OPERATIONS).toEqual(['insert', 'update', 'delete', 'undelete']);
  });
});
