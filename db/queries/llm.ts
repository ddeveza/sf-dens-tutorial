// LLM quota (ARCHITECTURE.md Data Model §3): limits arrive as jsonb from lib/llm/config.ts, SQL holds no tunables.
// reserve_llm_call is what submitAttempt calls BEFORE any Claude call; check_llm_quota is the read the UI shows.
import 'server-only';
import { z } from 'zod';
import type { QuotaLimits } from '@/lib/llm/config';
import type { Json } from '@/types/database';
import { QueryError, type Db } from './client';

const QuotaSchema = z.object({
  allowed: z.boolean(),
  remaining_hour: z.number().int(),
  remaining_day: z.number().int(),
  /** ISO instant of the next hourly bucket when the hourly cap refused the call; null otherwise. */
  retry_after: z.string().nullable(),
});
export type QuotaStatus = z.infer<typeof QuotaSchema>;

/** `p_plan_limits`, keyed by profiles.plan (lib/llm/config.ts `quotaLimitsPayload()`). */
export type PlanLimits = Record<string, QuotaLimits>;

function parseQuota(op: string, data: unknown): QuotaStatus {
  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) throw new QueryError(op, { message: 'no quota row returned' });
  return QuotaSchema.parse(row);
}

/** Check + increment atomically (per-user transaction lock). `allowed = false` => nextAction 'retry_later', no call. */
export async function reserveLlmCall(db: Db, planLimits: PlanLimits): Promise<QuotaStatus> {
  const { data, error } = await db.rpc('reserve_llm_call', { p_plan_limits: planLimits as unknown as Json });
  if (error) throw new QueryError('reserve_llm_call', error);
  return parseQuota('reserve_llm_call', data);
}

/** Read only; never increments. 22023 when the plan has no limits, 28000 without a session. */
export async function checkLlmQuota(db: Db, planLimits: PlanLimits): Promise<QuotaStatus> {
  const { data, error } = await db.rpc('check_llm_quota', { p_plan_limits: planLimits as unknown as Json });
  if (error) throw new QueryError('check_llm_quota', error);
  return parseQuota('check_llm_quota', data);
}

/** Seconds until `retry_after` (for ActionResult.retryAfterSec); 0 when the instant has passed or is absent. */
export function retryAfterSeconds(quota: Pick<QuotaStatus, 'retry_after'>, now: Date): number {
  if (!quota.retry_after) return 0;
  const ms = new Date(quota.retry_after).getTime() - now.getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
}
