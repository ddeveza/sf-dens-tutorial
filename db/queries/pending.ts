// Pending-evaluation drain (ARCHITECTURE.md LLM boundary "Pending-evaluation flow"). Two drain points share these:
// the learner's next submitAttempt (session client: RLS scopes the listing to their own rows) and
// GET /api/cron/evaluations (admin client: every user, `next_retry_at <= now`).
import 'server-only';
import { z } from 'zod';
import { DB_CONFIG } from '@/db/config';
import { ATTEMPT_STATUSES } from '@/lib/assessments/types';
import type { Json } from '@/types/database';
import type { AttemptInsert, AttemptRow, MasteryPatchRow, ReviewPatchRow, StepPatch, XpEventRow } from './attempts';
import { QueryError, type Db } from './client';

export interface ListPendingOptions {
  limit: number;
  /** Only rows whose `next_retry_at` has passed (or is unset). */
  dueOnly: boolean;
  /** Reference instant for `dueOnly`; defaults to the wall clock. */
  now?: Date;
  /** Explicit even under RLS (required with the admin client when draining one learner). */
  userId?: string;
}

/** Oldest first, so a learner's earliest parked step completes first. */
export async function listPendingEvaluations(db: Db, options: ListPendingOptions): Promise<AttemptRow[]> {
  let query = db.from('attempts').select('*').eq('status', 'pending_evaluation').order('created_at', { ascending: true }).limit(options.limit);
  if (options.userId !== undefined) query = query.eq('user_id', options.userId);
  if (options.dueOnly) {
    const iso = (options.now ?? new Date()).toISOString();
    query = query.or(`next_retry_at.is.null,next_retry_at.lte.${iso}`);
  }
  const { data, error } = await query;
  if (error) throw new QueryError('attempts.pending', error);
  return data;
}

/** The evaluation columns resolve_pending_evaluation may move; identity columns never travel here. */
export type PendingEvaluationUpdate = Partial<
  Pick<
    AttemptInsert,
    | 'status'
    | 'score'
    | 'correct'
    | 'passed'
    | 'verdict'
    | 'llm_evaluation'
    | 'applied_delta'
    | 'flags'
    | 'misconception_ids'
    | 'retry_count'
    | 'next_retry_at'
    | 'failure_reason'
  >
>;

/**
 * record_attempt's shape minus the attempt identity. A failed retry carries only `attempt` (status stays
 * pending_evaluation, retry bookkeeping bumped) or the give-up (`needs_review`); both leave mastery untouched.
 */
export interface ResolvePendingPayload {
  attempt: PendingEvaluationUpdate;
  masteryPatches?: MasteryPatchRow[] | null;
  reviewPatches?: ReviewPatchRow[] | null;
  xpEvents?: XpEventRow[] | null;
  stepPatch?: StepPatch | null;
}

const ResolveResultSchema = z.object({
  attemptId: z.number().int(),
  insertedXp: z.number().int(),
  status: z.enum(ATTEMPT_STATUSES),
});
export type ResolvePendingResult = z.infer<typeof ResolveResultSchema>;

/**
 * 42501 = not the caller's row (or no longer pending) for a session; 22023 = unknown / non-pending id for the
 * service role or a payload without `attempt`.
 */
export async function resolvePendingEvaluation(
  db: Db,
  attemptId: number,
  payload: ResolvePendingPayload,
  options: { timeoutMs?: number } = {},
): Promise<ResolvePendingResult> {
  const { data, error } = await db
    .rpc('resolve_pending_evaluation', { p_attempt_id: attemptId, payload: payload as unknown as Json })
    .abortSignal(AbortSignal.timeout(options.timeoutMs ?? DB_CONFIG.rpcTimeoutMs));
  if (error) throw new QueryError('resolve_pending_evaluation', error);
  return ResolveResultSchema.parse(data);
}
