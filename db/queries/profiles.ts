// profiles: created by the auth trigger, never from a request path. Sessions may update exactly three columns
// (column grant in 0001); `plan` and `email` are admin-owned.
import 'server-only';
import type { Tables } from '@/types/database';
import { QueryError, type Db } from './client';

export type ProfileRow = Tables<'profiles'>;

export const EXPLANATION_MODES = ['caveman', 'technical'] as const;
export type ExplanationMode = (typeof EXPLANATION_MODES)[number];

/** The learner-editable columns; the DB trigger validates `time_zone` against pg_timezone_names (22023 otherwise). */
export interface ProfilePatch {
  display_name?: string;
  time_zone?: string;
  explanation_mode_default?: ExplanationMode;
}

export async function getProfile(db: Db, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new QueryError('profiles.select', error);
  return data;
}

/** For request paths that already hold verified claims: a missing row is a bug (the trigger creates it), not a 404. */
export async function requireProfile(db: Db, userId: string): Promise<ProfileRow> {
  const profile = await getProfile(db, userId);
  if (!profile) throw new QueryError('profiles.select', { message: `no profile row for ${userId}`, code: 'PGRST116' });
  return profile;
}

export async function updateProfile(db: Db, userId: string, patch: ProfilePatch): Promise<ProfileRow> {
  const { data, error } = await db.from('profiles').update(patch).eq('id', userId).select('*').single();
  if (error) throw new QueryError('profiles.update', error);
  return data;
}
