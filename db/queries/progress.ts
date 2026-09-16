// /progress loader: the same GamificationContext the dashboard uses (buildProgressViewModel reads it) plus paged
// attempt history for the timeline (DB_CONFIG.queryPageSize).
import 'server-only';
import { DB_CONFIG } from '@/db/config';
import type { AttemptRow } from './attempts';
import { QueryError, type Db } from './client';
import { loadDashboardContext, type DashboardContext, type DashboardExtras } from './dashboard';

export type ProgressContext = DashboardContext;
export type ProgressExtras = Omit<DashboardExtras, 'lastDashboardViewedAt'>;

export async function loadProgressContext(db: Db, userId: string, extras: ProgressExtras = {}): Promise<ProgressContext> {
  return loadDashboardContext(db, userId, extras);
}

export interface AttemptPage {
  rows: AttemptRow[];
  /** `created_at` of the last row; pass as `before` to fetch the next (older) page. Null when the page is empty. */
  nextBefore: string | null;
  hasMore: boolean;
}

/** Newest first, keyset-paged on created_at (hits attempts_user_local_date / the pkey; no OFFSET). */
export async function listAttemptHistory(
  db: Db,
  userId: string,
  options: { before?: string; pageSize?: number } = {},
): Promise<AttemptPage> {
  const pageSize = options.pageSize ?? DB_CONFIG.queryPageSize;
  let query = db
    .from('attempts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1);
  if (options.before !== undefined) query = query.lt('created_at', options.before);
  const { data, error } = await query;
  if (error) throw new QueryError('attempts.history', error);
  const hasMore = data.length > pageSize;
  const rows = hasMore ? data.slice(0, pageSize) : data;
  const last = rows.at(-1);
  return { rows, nextBefore: last ? last.created_at : null, hasMore };
}
