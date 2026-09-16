// Secret-key client: bypasses RLS. Imported only from app/api/cron/** and scripts/** (ESLint no-restricted-imports
// enforces it). Deliberately NO 'server-only' and relative `.ts` specifiers: scripts/sync-curriculum.ts loads this
// under plain `node` type stripping, where `server-only` throws and the `@/` alias does not resolve.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerEnv } from '../lib/env/server.ts';
import type { Database } from '../types/database.ts';

export type AdminDb = SupabaseClient<Database>;

/**
 * A new client per call (cheap; no session, no refresh timer). `NEXT_PUBLIC_SUPABASE_URL` is read literally so
 * Next can inline it in the cron routes; the secret comes from the Zod-parsed server env, which is the only
 * place `SUPABASE_SECRET_KEY` is read.
 */
export function createAdminClient(): AdminDb {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  const { SUPABASE_SECRET_KEY } = getServerEnv();
  return createClient<Database>(url, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
