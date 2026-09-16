// Concept subtree `transaction` (Day 12): transaction boundaries, rollback, post-commit work and batch chunks.
// Authored now because weekly boss 2 ("The Thursday change set") spans Days 8-13; Day 12's lesson lands later.
// Apex REST as a boundary rests on the "custom Web service method" wording (ambiguity 14).
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const TRANSACTION_CONCEPTS = [
  defineConcept({
    slug: 'transaction',
    world,
    title: 'One transaction',
    summary: {
      caveman: 'One shopping trip: either everything in the cart gets paid for, or you walk out with nothing.',
      technical: 'Transaction boundaries, all-or-nothing rollback, post-commit work, savepoints and batch chunk semantics.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'transaction.boundaries',
    world,
    title: 'Transaction boundaries and rollback',
    summary: {
      caveman: 'One shopping trip: either everything in the cart gets paid for, or you walk out with nothing. The thank-you letter is mailed only after the register says paid; if you walk out, no letter is ever sent.',
      technical: 'A transaction starts at a boundary (trigger, class method invoked from the UI or API, anonymous block, Visualforce page, custom Web service method) and commits at step 19 of the save order. Any uncaught exception or governor limit rolls back every DML statement in it (payments are the documented exception). Post-commit work (emails, queueable and future jobs, asynchronous flow paths) runs only after commit: jobs enqueued by a rolled-back transaction never run. Flow interviews share the transaction and its limits; a transaction ends at a Screen, Local Action or Wait element. Savepoints: setSavepoint and rollback count as DML statements, static variables are not reverted, savepoints cannot cross trigger invocations and must be released before callouts (from API 60.0 tests release them at Test.startTest/stopTest).',
    },
    terms: [
      { term: 'transaction', caveman: 'one shopping trip' },
      { term: 'commit', caveman: 'the register saying paid' },
      { term: 'post-commit work', caveman: 'the thank-you letter' },
      { term: 'savepoint', caveman: 'a bookmark in the trip' },
    ],
    misconceptions: [
      { id: 'enqueued-survives', summary: 'Believes a queueable enqueued before a later failure still runs.', probe: 'A trigger enqueues a job; later in the same save a validation rule fails. Does the job ever run?' },
      { id: 'callout-with-pending-work', summary: 'Makes a callout with uncommitted DML pending.', probe: 'Why does Apex throw when you call out after a DML statement in the same transaction?' },
      { id: 'statics-roll-back', summary: 'Expects static variables to be reverted by Database.rollback.', probe: 'You roll back to a savepoint. What happens to a static counter you incremented?' },
    ],
    probes: {
      why: ['Why does the platform run post-commit work only after the commit?'],
      what_if: ['What if a validation rule fails after an email was "sent" earlier in the same transaction?'],
      predict: ['Predict which rows exist after insert a; insert b; throw new MyException();'],
      what_breaks: ['What breaks when a callout is placed between two DML statements?'],
    },
  }),

  defineConcept({
    slug: 'transaction.batch-chunks',
    world,
    title: 'Batch chunks are separate transactions',
    summary: {
      caveman: 'A long errand is split into many small shopping trips. If trip four fails, trips one to three stay paid for; the shop does not un-ring them.',
      technical: 'Each execute() invocation of a Batch Apex job processes one chunk (200 records by default) in its own transaction with its own governor limits; a failure in chunk 4 does not roll back chunks 1-3 (Database.Stateful plus your own compensation logic if you need cross-chunk consistency). Platform-event triggers likewise run in their own asynchronous process. This isolation is why a nightly batch can leave partially updated data after a mid-run failure.',
    },
    terms: [
      { term: 'batch chunk', caveman: 'one small trip of the long errand' },
      { term: 'Database.Stateful', caveman: 'a notebook carried between trips' },
    ],
    misconceptions: [
      { id: 'batch-is-one-transaction', summary: 'Expects a failed batch chunk to roll back earlier chunks.', probe: 'A nightly batch fails on chunk 4 of 10. What state are the first three chunks in?' },
      { id: 'batch-limits-shared', summary: 'Believes the whole batch job shares one set of governor limits.', probe: 'How many SOQL queries may a 10-chunk batch job issue in total?' },
    ],
    probes: {
      why: ['Why does each batch chunk get its own transaction?'],
      predict: ['Predict the data after a batch that fails on its last chunk.'],
      what_would_you_change: ['What would you change in a batch whose work must be all-or-nothing across chunks?'],
    },
  }),
];
