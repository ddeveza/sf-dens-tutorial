// mastery: six score columns + overall, band, cap_reason, evidence_count, state jsonb. Written only by record_attempt /
// resolve_pending_evaluation; the engine parses `state` on read (parseMasteryState, lenient by design).
import 'server-only';
import { parseMasteryState } from '@/lib/mastery-engine/state';
import type { MasteryState } from '@/lib/mastery-engine/types';
import type { Tables } from '@/types/database';
import { QueryError, type Db } from './client';

export type MasteryRow = Tables<'mastery'>;

export async function getMasteryForUser(db: Db, userId: string): Promise<Map<string, MasteryRow>> {
  // explicit even under RLS: required with the admin client, and it hits mastery_pkey
  const { data, error } = await db.from('mastery').select('*').eq('user_id', userId);
  if (error) throw new QueryError('mastery.select', error);
  return new Map(data.map((row) => [row.concept_id, row]));
}

export async function getMasteryForConcepts(db: Db, userId: string, conceptIds: readonly string[]): Promise<Map<string, MasteryRow>> {
  if (conceptIds.length === 0) return new Map();
  const { data, error } = await db.from('mastery').select('*').eq('user_id', userId).in('concept_id', [...conceptIds]);
  if (error) throw new QueryError('mastery.select_concepts', error);
  return new Map(data.map((row) => [row.concept_id, row]));
}

export async function getMasteryRow(db: Db, userId: string, conceptId: string): Promise<MasteryRow | null> {
  const { data, error } = await db.from('mastery').select('*').eq('user_id', userId).eq('concept_id', conceptId).maybeSingle();
  if (error) throw new QueryError('mastery.get', error);
  return data;
}

/** The engine's view of a row; the generated row satisfies `MasteryRowLike` (enum pins in types.test-d.ts). */
export function toMasteryState(row: MasteryRow): MasteryState {
  return parseMasteryState(row);
}
