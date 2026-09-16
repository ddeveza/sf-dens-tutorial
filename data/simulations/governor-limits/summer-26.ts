// Governor limits as documented for Summer '26 (API 67.0), Apex Developer Guide "Execution Governors and Limits",
// version 262.0 (source id dev-apex-gov-limits-262). Numbers are copied from the per-transaction table; nothing in
// ARCHITECTURE.md is authoritative for them. Validated against GovernorRuleSetSchema on import.
import { GovernorRuleSetSchema } from '../../../lib/simulations/governor-limits/index.ts';
import type { GovernorRules, LimitKey } from '../../../lib/simulations/governor-limits/index.ts';
import type { RuleSet } from '../../../lib/simulations/rule-set.ts';

const MB = 1024 * 1024;

// Synchronous column of the per-transaction table.
const synchronous: Record<LimitKey, number> = {
  soqlQueries: 100,
  soqlRows: 50_000,
  dmlStatements: 150,
  dmlRows: 10_000,
  callouts: 100,
  cpuMs: 10_000,
  heapBytes: 6 * MB,
  futureCalls: 50,
  queueableJobs: 50,
  emailInvocations: 10,
  soslQueries: 20,
};

// Asynchronous column (batch Apex, future methods, queueable Apex): only SOQL, CPU and heap grow;
// futures drop to 0 from batch/future contexts and enqueueJob drops to 1 in any asynchronous context.
const asynchronous: Record<LimitKey, number> = {
  ...synchronous,
  soqlQueries: 200,
  cpuMs: 60_000,
  heapBytes: 12 * MB,
  futureCalls: 0,
  queueableJobs: 1,
};

const rules: GovernorRules = {
  limits: {
    sync: synchronous,
    future: asynchronous,
    batch: asynchronous,
    // A queueable may call one future method (table footnote: "1 in queueable context").
    queueable: { ...asynchronous, futureCalls: 1 },
    // Scheduled Apex runs against the synchronous per-transaction limits (Day 15 research row), but its execute()
    // is still an asynchronous transaction for System.enqueueJob, which allows one job there.
    scheduled: { ...synchronous, queueableJobs: 1 },
  },
  triggerChunkSize: 200,
  uncatchable: true,
  notes: {
    heapBytes: "6 MB synchronous / 12 MB asynchronous on Summer '26. Winter '27 raises these to 10 / 25 MB; whether that rollout is release-based (org-wide on upgrade) or API-versioned is unresolved, so a Summer '26 org must plan against these numbers.",
    futureCalls: '50 per invocation; 0 from batch and future contexts; 1 from a queueable. Re-verify the queueable value against the guide footnote, it is not in the Day 15 research row.',
    queueableJobs: '50 per synchronous transaction; 1 in any asynchronous context (future, batch, queueable, scheduled).',
    soqlQueries: "Scheduled Apex is encoded with the synchronous limits per the Day 15 research row ('scheduled Apex uses sync limits'); re-verify against the guide before citing it in a lesson.",
    cpuMs: 'CPU time is shared across namespaces; certified managed packages do not get their own copy.',
  },
};

const set: RuleSet<GovernorRules> = {
  id: 'governor-limits@summer-26',
  simulation: 'governor-limits',
  release: 'summer-26',
  apiVersion: '67.0',
  sourceIds: ['dev-apex-gov-limits-262'],
  verification: {
    release: 'summer-26',
    apiVersion: '67.0',
    docVersion: "Summer '26 (version 262.0)",
    lastVerified: '2026-09-04',
    status: 'verified',
  },
  rules,
};

GovernorRuleSetSchema.parse(set);

export const summer26 = set;
