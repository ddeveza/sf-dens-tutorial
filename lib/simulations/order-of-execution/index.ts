// Order of Execution Simulator (ARCHITECTURE.md, Simulations). Pure: plain objects in and out, no IO, no env, no clock.
// The canonical stage list, phases, operation applicability and rerun rules live in the RuleSet the page passes
// (data/simulations/order-of-execution/<release>.ts); this file only encodes how to run them.
import { z } from 'zod';
import type { RuleSet } from '../rule-set.ts';
import { ruleSetSchema } from '../rule-set-schema.ts';

export const STAGE_IDS = [
  'load',
  'systemValidation',
  'beforeSaveFlow',
  'beforeTrigger',
  'customValidation',
  'duplicateRules',
  'saveNoCommit',
  'afterTrigger',
  'assignmentRules',
  'autoResponseRules',
  'workflowRules',
  'escalationRules',
  'workflowLaunchedFlows',
  'afterSaveFlow',
  'entitlementRules',
  'rollupSummary',
  'grandparentRollup',
  'criteriaSharing',
  'commit',
  'postCommit',
] as const;
export type StageId = (typeof STAGE_IDS)[number];

export const OOE_OPERATIONS = ['insert', 'update', 'delete', 'undelete'] as const;
export type OoEOperation = (typeof OOE_OPERATIONS)[number];

export const OOE_PHASES = ['pre-save', 'save', 'post-save', 'commit', 'post-commit'] as const;
export type OoEPhase = (typeof OOE_PHASES)[number];

export const OOE_RERUN_CAUSES = ['workflowFieldUpdate'] as const;
export type OoERerunCause = (typeof OOE_RERUN_CAUSES)[number];

export interface OoEInput {
  operation: OoEOperation;
  configured: Partial<Record<StageId, boolean>>; // which automations exist on the object; unspecified => false
  workflowDoesFieldUpdate: boolean;
  learnerOrder: StageId[];
}

export interface OoEStageRule {
  id: StageId;
  phase: OoEPhase;
  appliesTo: OoEOperation[];
  always?: boolean; // structural stage (load, save, commit...) that runs regardless of `configured`
}

export interface OoERerunRule {
  cause: OoERerunCause;
  rerun: StageId[]; // stages that run again, in canonical order, when the cause fires
  skip: StageId[]; // stages explicitly NOT re-run (documents the recursive-save exemptions)
  maxCount: number; // how many extra passes the cause can trigger
}

export interface OoERules {
  stages: OoEStageRule[];
  reruns: OoERerunRule[];
}

export interface OoERerun {
  stage: StageId;
  cause: string;
  iteration: number; // 1-based extra pass number
}

export interface OoEDiffEntry {
  index: number;
  expected: StageId;
  got?: StageId; // absent when the learner order is shorter than the actual order
}

export interface OoEResult {
  actualOrder: StageId[];
  reruns: OoERerun[];
  diff: OoEDiffEntry[];
  score: number; // 0-100, LCS ratio (scoreOrdering below; same algorithm as lib/assessments scoreOrdering)
}

// The stage whose completion lets each cause fire, and the input flag that switches the cause on.
const RERUN_TRIGGER_STAGE: Record<OoERerunCause, StageId> = { workflowFieldUpdate: 'workflowRules' };

function causeEnabled(cause: OoERerunCause, input: OoEInput): boolean {
  switch (cause) {
    case 'workflowFieldUpdate':
      return input.workflowDoesFieldUpdate;
  }
}

// ---------- schemas ----------

const StageIdSchema = z.enum(STAGE_IDS);

export const OoEStageRuleSchema = z
  .object({
    id: StageIdSchema,
    phase: z.enum(OOE_PHASES),
    appliesTo: z.array(z.enum(OOE_OPERATIONS)).min(1),
    always: z.boolean().optional(),
  })
  .strict();

export const OoERerunRuleSchema = z
  .object({
    cause: z.enum(OOE_RERUN_CAUSES),
    rerun: z.array(StageIdSchema).min(1),
    skip: z.array(StageIdSchema),
    maxCount: z.number().int().min(1),
  })
  .strict();

export const OoERulesSchema = z
  .object({
    stages: z.array(OoEStageRuleSchema).min(1),
    reruns: z.array(OoERerunRuleSchema),
  })
  .strict()
  .superRefine((rules, ctx) => {
    const ids = new Set<StageId>();
    rules.stages.forEach((stage, index) => {
      if (ids.has(stage.id)) ctx.addIssue({ code: 'custom', message: `duplicate stage '${stage.id}'`, path: ['stages', index, 'id'] });
      ids.add(stage.id);
    });
    for (const id of STAGE_IDS) {
      if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `canonical stage '${id}' missing from the rule set`, path: ['stages'] });
    }
    rules.reruns.forEach((rule, index) => {
      const trigger = RERUN_TRIGGER_STAGE[rule.cause];
      if (!ids.has(trigger)) {
        ctx.addIssue({ code: 'custom', message: `cause '${rule.cause}' needs stage '${trigger}'`, path: ['reruns', index, 'cause'] });
      }
      rule.rerun.forEach((id, i) => {
        if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `rerun stage '${id}' not in stages`, path: ['reruns', index, 'rerun', i] });
        if (rule.skip.includes(id)) ctx.addIssue({ code: 'custom', message: `stage '${id}' is both rerun and skip`, path: ['reruns', index, 'rerun', i] });
      });
      rule.skip.forEach((id, i) => {
        if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `skip stage '${id}' not in stages`, path: ['reruns', index, 'skip', i] });
      });
    });
  });

export const OoERuleSetSchema = ruleSetSchema('order-of-execution', OoERulesSchema);

export const OoEInputSchema = z
  .object({
    operation: z.enum(OOE_OPERATIONS),
    configured: z.partialRecord(StageIdSchema, z.boolean()),
    workflowDoesFieldUpdate: z.boolean(),
    learnerOrder: z.array(StageIdSchema),
  })
  .strict();

// ---------- scoring ----------

function longestCommonSubsequence(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

// exact => 100; otherwise LCS(answer, key) / max(len) x 100, so missing and extra items both cost.
// Deliberately identical to lib/assessments scoreOrdering so a lesson question and the simulator agree.
export function scoreOrdering(answer: readonly string[], key: readonly string[]): number {
  const exact = answer.length === key.length && answer.every((item, i) => item === key[i]);
  if (exact) return 100;
  const len = Math.max(answer.length, key.length);
  if (len === 0) return 100;
  return Math.round((longestCommonSubsequence(answer, key) / len) * 100);
}

// ---------- engine ----------

function stageRuns(stage: OoEStageRule, input: OoEInput): boolean {
  if (!stage.appliesTo.includes(input.operation)) return false;
  return stage.always === true || input.configured[stage.id] === true;
}

export function simulate(input: OoEInput, ruleSet: RuleSet<OoERules>): OoEResult {
  const active = ruleSet.rules.stages.filter((stage) => stageRuns(stage, input));
  const actualOrder: StageId[] = [];
  const reruns: OoERerun[] = [];

  for (const stage of active) {
    actualOrder.push(stage.id);
    for (const rule of ruleSet.rules.reruns) {
      if (RERUN_TRIGGER_STAGE[rule.cause] !== stage.id || !causeEnabled(rule.cause, input)) continue;
      const passStages = active.filter((s) => rule.rerun.includes(s.id) && !rule.skip.includes(s.id));
      for (let iteration = 1; iteration <= rule.maxCount; iteration++) {
        for (const rerunStage of passStages) {
          actualOrder.push(rerunStage.id);
          reruns.push({ stage: rerunStage.id, cause: rule.cause, iteration });
        }
      }
    }
  }

  const diff: OoEDiffEntry[] = [];
  actualOrder.forEach((expected, index) => {
    const got = input.learnerOrder[index];
    if (got === expected) return;
    diff.push(got === undefined ? { index, expected } : { index, expected, got });
  });

  return { actualOrder, reruns, diff, score: scoreOrdering(input.learnerOrder, actualOrder) };
}
