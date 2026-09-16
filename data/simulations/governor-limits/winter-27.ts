// Governor limits as documented for Winter '27 (API 68.0), Apex Developer Guide "Execution Governors and Limits",
// current version (source id dev-apex-gov-limits) plus the Winter '27 Apex release notes (rn-w27-apex) for the heap
// change. Only heap moved versus Summer '26; every other row is unchanged. Validated on import.
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
  heapBytes: 10 * MB, // Winter '27: 6 MB -> 10 MB
  futureCalls: 50,
  queueableJobs: 50,
  emailInvocations: 10,
  soslQueries: 20,
};

// Asynchronous column (batch Apex, future methods, queueable Apex).
const asynchronous: Record<LimitKey, number> = {
  ...synchronous,
  soqlQueries: 200,
  cpuMs: 60_000,
  heapBytes: 25 * MB, // Winter '27: 12 MB -> 25 MB
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
    heapBytes: "10 MB synchronous / 25 MB asynchronous per the Winter '27 Apex release notes (was 6 / 12 MB on Summer '26). OPEN QUESTION: whether the raise is release-based (every org on Winter '27 gets it, regardless of the class's API version) or API-versioned (only API 68.0+ code) is unresolved; the lesson must show both numbers with the release attached until this is confirmed.",
    futureCalls: '50 per invocation; 0 from batch and future contexts; 1 from a queueable. Re-verify the queueable value against the guide footnote, it is not in the Day 15 research row.',
    queueableJobs: '50 per synchronous transaction; 1 in any asynchronous context (future, batch, queueable, scheduled).',
    soqlQueries: "Scheduled Apex is encoded with the synchronous limits per the Day 15 research row ('scheduled Apex uses sync limits'); re-verify against the guide before citing it in a lesson.",
    cpuMs: 'CPU time is shared across namespaces; certified managed packages do not get their own copy.',
  },
};

const set: RuleSet<GovernorRules> = {
  id: 'governor-limits@winter-27',
  simulation: 'governor-limits',
  release: 'winter-27',
  apiVersion: '68.0',
  sourceIds: ['dev-apex-gov-limits', 'rn-w27-apex'],
  verification: {
    release: 'winter-27',
    apiVersion: '68.0',
    docVersion: "Winter '27 (Latest, version 264.0)",
    lastVerified: '2026-09-04',
    status: 'verified',
  },
  rules,
};

GovernorRuleSetSchema.parse(set);

export const winter27 = set;
