// Concept subtree `order-of-execution` (Day 13): the 20-step save sequence, recursive saves, workflow re-fire and
// Trigger.old. Built from the text of the Apex guide (identical across Spring '26, Summer '26 and Winter '27), not
// from the Data Model Gallery diagram (ambiguity 12). Authored now because weekly boss 2 spans Days 8-13.
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const ORDER_OF_EXECUTION_CONCEPTS = [
  defineConcept({
    slug: 'order-of-execution',
    world,
    title: 'The save order of execution',
    summary: {
      caveman: 'Saving a rock is a 20-step assembly line: checked, patted, stamped, checked again, and only at the very end does the warehouse door open.',
      technical: 'The 20-step save sequence, recursive saves, workflow re-fire and what Trigger.old sees.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'order-of-execution.save-sequence',
    world,
    title: 'The 20-step save sequence',
    summary: {
      caveman: 'Saving a rock is a 20-step assembly line: load it, apply what the sender wrote, the early helpers reshape it, the checks run, it is set down without being locked in, the late helpers run, the tallies on the big rock update, and only at the very end does the warehouse door open.',
      technical: "1 load or initialize, 2 apply request values and request-type validation, 3 before-save flows, 4 before triggers, 5 system and custom validation, 6 duplicate rules, 7 save without commit, 8 after triggers, 9 assignment rules, 10 auto-response rules, 11 workflow rules (a field update re-runs before and after update triggers once more only), 12 escalation rules, 13 Process Builder and workflow-launched flows, 14 after-save flows, 15 entitlement rules, 16 roll-up summary to the parent, 17 grandparent roll-ups, 18 criteria-based sharing, 19 commit, 20 post-commit logic. The list is textually identical across Spring '26, Summer '26 and Winter '27. Before-save flows and before triggers change the record in memory with no extra DML; a change made after step 8 costs another DML and re-enters the sequence. There is no guaranteed order among triggers on the same object and event.",
    },
    terms: [
      { term: 'order of execution', caveman: 'the assembly line' },
      { term: 'before-save flow', caveman: 'an early helper' },
      { term: 'after trigger', caveman: 'a late helper' },
    ],
    misconceptions: [
      { id: 'after-trigger-defaults', summary: 'Sets default values in an after trigger, where records are read-only, so it needs an extra DML and re-fires the sequence.', probe: 'Where in the sequence should a default value be set, and why?' },
      { id: 'validation-before-triggers', summary: 'Believes validation rules run before before-triggers.', probe: 'A before trigger fixes a field that a validation rule checks. Does the rule see the fixed value?' },
      { id: 'trigger-order-guaranteed', summary: 'Relies on the firing order of two triggers on the same object and event.', probe: 'Two after-insert triggers on Account: which runs first?' },
    ],
    probes: {
      why: ['Why does the platform save without committing at step 7?'],
      predict: ['A before-save flow sets Field A; a before trigger, a validation rule and an after-save flow all read A. Which of them see the new value?'],
      what_breaks: ['What breaks when an after-save flow updates the record that fired it?'],
      what_if: ["What if two triggers on the same event depend on each other's results?"],
    },
  }),

  defineConcept({
    slug: 'order-of-execution.recursive-save',
    world,
    title: 'Recursive saves, workflow re-fire and Trigger.old',
    summary: {
      caveman: 'If a late helper changes the rock, the rock goes back down the line, but the second pass skips the middle stations. And the note pinned to the rock saying what it looked like before still shows the very first version, not the reshaped one.',
      technical: 'A workflow field update re-runs before-update and after-update triggers once more (only once) on the changed record; Trigger.old in that re-run still holds the values from before the original save, not the post-workflow values. Recursive saves caused by after-save changes skip steps 9-17 (assignment, auto-response, workflow, escalation, processes, after-save flows, entitlements, roll-ups). An after-save flow that updates its own record is the classic "runs twice" ticket; the fix is a before-save flow, which changes the record in memory with no extra DML.',
    },
    terms: [
      { term: 'recursive save', caveman: 'the rock going back down the line' },
      { term: 'Trigger.old', caveman: 'the note pinned to the rock saying what it looked like before' },
      { term: 'workflow re-fire', caveman: 'the late helper sending the rock back' },
    ],
    misconceptions: [
      { id: 'trigger-old-updates', summary: 'Expects Trigger.old to reflect the workflow field update on the re-run.', probe: 'After a workflow field update re-fires the trigger, what does Trigger.old contain?' },
      { id: 'recursion-runs-everything', summary: 'Expects a recursive save to re-run roll-ups and after-save flows.', probe: 'Which steps are skipped on a recursive save?' },
    ],
    probes: {
      why: ['Why does the platform skip steps 9-17 on a recursive save?'],
      predict: ['Predict how many times an after-save flow that updates its own record runs.'],
      what_would_you_change: ['What would you change about an after-save flow that sets Status on the record that fired it?'],
    },
  }),
];
