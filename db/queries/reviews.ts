// review_items: one live item per (user, concept); due-ness is a learner-local DATE. Review debt is defined once:
// count(*) where due_on <= today_local (the same `<=` the derived stats and the reminder cron use).
import 'server-only';
import { toDepth } from '@/lib/learning-engine/util';
import { INTERVAL_DAYS, type IntervalDays, type ReviewItem } from '@/lib/spaced-repetition/types';
import type { Tables } from '@/types/database';
import { QueryError, type Db } from './client';

export type ReviewItemRow = Tables<'review_items'>;

const DUE_SELECT =
  'id, concept_id, dimension, depth, question_type, angle, exclude_form_keys, due_on, interval_days, last_outcome, review_count, lapses, reason, concepts!inner(title, world_id)';

/** Items with `due_on <= todayLocal` (YYYY-MM-DD in profiles.time_zone), oldest first, with the concept title. */
export async function getDueReviewItems(db: Db, userId: string, todayLocal: string, limit: number) {
  const { data, error } = await db
    .from('review_items')
    .select(DUE_SELECT)
    .eq('user_id', userId)
    .lte('due_on', todayLocal) // review debt, defined once: count(*) where due_on <= today_local
    .order('due_on', { ascending: true })
    .limit(limit);
  if (error) throw new QueryError('review_items.due', error);
  return data; // row type inferred from the select string; `concepts` is an object (many-to-one)
}
export type DueReviewItem = Awaited<ReturnType<typeof getDueReviewItems>>[number];

export async function listReviewItems(db: Db, userId: string): Promise<ReviewItemRow[]> {
  const { data, error } = await db.from('review_items').select('*').eq('user_id', userId).order('due_on', { ascending: true });
  if (error) throw new QueryError('review_items.list', error);
  return data;
}

export async function getReviewItem(db: Db, userId: string, id: string): Promise<ReviewItemRow | null> {
  const { data, error } = await db.from('review_items').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw new QueryError('review_items.get', error);
  return data;
}

/** Overdue count with a HEAD request (no rows transferred). */
export async function countReviewDebt(db: Db, userId: string, todayLocal: string): Promise<number> {
  const { count, error } = await db
    .from('review_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('due_on', todayLocal);
  if (error) throw new QueryError('review_items.debt', error);
  return count ?? 0;
}

function asIntervalDays(value: number): IntervalDays {
  if ((INTERVAL_DAYS as readonly number[]).includes(value)) return value as IntervalDays;
  throw new QueryError('review_items.interval_days', { message: `interval_days ${value} is outside {${INTERVAL_DAYS.join(',')}}` });
}

/** Camel-cased ReviewItem for lib/spaced-repetition. */
export function toReviewItem(row: ReviewItemRow): ReviewItem {
  return {
    id: row.id,
    userId: row.user_id,
    conceptId: row.concept_id,
    dimension: row.dimension,
    depth: toDepth(row.depth),
    questionType: row.question_type,
    angle: row.angle,
    excludeFormKeys: row.exclude_form_keys,
    dueOn: row.due_on,
    intervalDays: asIntervalDays(row.interval_days),
    lastOutcome: row.last_outcome,
    reviewCount: row.review_count,
    lapses: row.lapses,
    reason: row.reason,
  };
}
