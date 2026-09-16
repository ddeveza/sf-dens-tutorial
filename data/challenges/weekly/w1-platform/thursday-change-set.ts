// Weekly boss 2, "The Thursday change set" (ARCHITECTURE.md First 30 Days, Day 14 row and "Bosses, Week 2").
// Spans Days 8-13: master-detail + roll-ups, after-save flow recursion, workflow re-fire and Trigger.old, batch
// chunk transactions, deployment path choice. Template, not a lesson; graded with BossRubricSchema.
import { boss, defineWeeklyBoss } from '../../../../lib/curriculum/builders.ts';

export const THURSDAY_CHANGE_SET = defineWeeklyBoss({
  id: 'weekly-w1-platform-thursday-change-set',
  world: 'w1-platform',
  title: 'The Thursday change set',
  concepts: [
    'order-of-execution.recursive-save',
    'order-of-execution.save-sequence',
    'transaction.batch-chunks',
    'transaction.boundaries',
    'formulas.rollup-summary',
    'relationships.lookup-vs-master-detail',
    'metadata-api.deploy-transaction',
  ],
  exercise: boss({
    id: 'incident',
    concept: 'order-of-execution.recursive-save',
    dimension: 'debugging',
    depth: 6,
    prompt: {
      caveman: 'The furniture arrived Thursday and the hut has been shaking since. Walk the assembly line step by step, say which helper is sending the rock back, and say what you would change.',
      technical: 'Work the incident as the on-call engineer: suspect, why, data needed, what to inspect, solution, trade-offs. Walk the 20-step save order and the recursive-save rules explicitly; treat the batch ticket separately.',
    },
    incident: [
      'Thursday\'s change set to production carried four changes: a lookup-to-master-detail conversion on Invoice_Line__c.Invoice__c, a new roll-up summary Total_Amount__c on Invoice__c, an after-save record-triggered flow on Invoice__c that sets Status__c to "Ready" when Total_Amount__c exceeds zero, and an after-update Apex trigger on Invoice__c that emails the customer when Status__c changes.',
      'Tickets since Thursday night:',
      '1. "The Status update runs twice": customers received two identical emails per invoice, and the flow interview logs show two interviews per save.',
      '2. A developer says Trigger.old "shows stale values": an existing workflow rule updates Approval_Note__c on Invoice__c, and on the re-run the trigger sees the pre-workflow value in Trigger.old and misfires.',
      '3. The nightly Invoice batch (Batch Apex, 200-record scope) failed on chunk 4 with a LimitException; the job\'s error is logged, but invoices from chunks 1-3 "were not undone" and Finance wants to know why the platform did not roll them back.',
      'The org is on Summer \'26 (API 67.0). The change set was validated in a Developer sandbox with a handful of records and no roll-up data.',
    ].join('\n\n'),
    rubricKeyPoints: {
      suspect: [
        'The after-save flow updates the record that fired it, which is another DML on the same record and re-enters the save sequence (a recursive save), so the trigger and the flow observe the change twice',
        'The workflow field update re-fires the before/after update triggers once more, and Trigger.old on that re-run holds the values from before the original save by design',
        'Each Batch Apex execute() chunk is its own transaction; chunks 1-3 committed before chunk 4 hit the limit, so there is nothing to roll back across chunks',
      ],
      why: [
        'Step 14 (after-save flows) runs after step 7 (save without commit) and step 8 (after triggers); a same-record update from an after-save flow costs a second DML and re-runs the sequence, skipping steps 9-17 on the recursive pass',
        'Step 11 (workflow rules): a field update re-runs update triggers once more only, and the documented semantics keep Trigger.old at the pre-workflow values',
        'The roll-up summary recalculates at step 16 on the parent, which is why Total_Amount__c is only visible to the after-save flow on the parent save, not to before-save logic on the line',
        'Batch isolation per chunk is the documented transaction model: governor limits and rollback are per execute(), and Database.Stateful only carries state, not rollback',
      ],
      dataNeeded: [
        'Debug log for one affected Invoice save showing every DML and which step of the sequence each flow and trigger ran in',
        'The flow\'s trigger type (after-save vs before-save), its entry conditions and whether it has a "only when a record is updated to meet the conditions" guard',
        'The workflow rule and field update definitions, and the trigger code that reads Trigger.old',
        'The AsyncApexJob record for the batch: which scope failed, the exact limit, and whether execute() has error handling or Database.Stateful',
      ],
      whatToInspect: [
        'Flow Builder: the record-triggered flow\'s configuration (after-save, same-record update) and interview logs per save',
        'Apex debug log stages (FLOW_START_INTERVIEW, WF_FIELD_UPDATE, CODE_UNIT_STARTED for the trigger) to count executions and see the recursion',
        'The trigger\'s use of Trigger.old versus Trigger.oldMap and any static recursion guard',
        'The batch class: scope size, what each execute() writes, and whether chunk work is idempotent',
      ],
      solution: [
        'Convert the Status update to a before-save flow: it changes the record in memory at step 3 with no extra DML and no re-fire; the email trigger then sees one change',
        'Make the email trigger idempotent (fire only on a Status transition using Trigger.oldMap, or record that the email was sent) and stop relying on the firing order of automations on the same event',
        'Treat Trigger.old on the workflow re-run as documented behaviour: compare against the intended pre-state or move the workflow logic into the same before-save flow',
        'For the batch: either make each chunk safe to re-run and rerun the job from chunk 4, or add compensating logic (or a status flag) so partially processed invoices can be found; do not expect cross-chunk rollback',
        'Next time rehearse in a Partial Copy sandbox with real invoice volumes and deploy through a DevOps Center pipeline instead of a Thursday change set',
      ],
      tradeOffs: [
        'A before-save flow cannot create related records or perform actions that need the saved Id, so some logic must remain after-save with recursion guards',
        'Idempotent triggers add bookkeeping (a sent flag or transition check) but survive re-fires, recursion and retries',
        'Cross-chunk consistency in Batch Apex costs design effort (Database.Stateful plus compensation) or a different tool; simply lowering scope size changes limits, not atomicity',
        'A Partial Copy sandbox and a pipeline add refresh cadence and process overhead but would have exercised roll-ups and recursion on realistic data before production',
      ],
    },
  }),
  sources: ['dev-apex-ooe', 'dev-apex-transaction', 'dev-apex-batch', 'help-kb-rollup-limit', 'help-change-set-tips', 'help-devops-center'],
  verification: { release: 'summer-26', apiVersion: '67.0', docVersion: "Winter '27 (Latest)", lastVerified: '2026-09-04', status: 'verified' },
});
