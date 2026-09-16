// db/queries: the only place `.from()` / `.rpc()` is called. Every file starts with `import 'server-only'` so a
// client-bundle import fails `next build`. Queries take the client as a parameter and never import db/admin.ts.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** Session client (RLS) or db/admin.ts (bypass); queries never care which. */
export type Db = SupabaseClient<Database>;

export interface QueryCause {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Postgres SQLSTATE codes the Server Actions map to `ActionResult` codes (ARCHITECTURE.md Data Model §5). */
export const PG_ERROR = {
  checkViolation: '23514',
  uniqueViolation: '23505',
  insufficientPrivilege: '42501',
  invalidParameterValue: '22023',
  invalidAuthorization: '28000',
} as const;

export class QueryError extends Error {
  readonly code: string | undefined;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(
    public readonly op: string,
    cause: QueryCause,
  ) {
    super(`${op}: ${cause.message}`);
    this.name = 'QueryError';
    this.code = cause.code;
    this.details = cause.details ?? null;
    this.hint = cause.hint ?? null;
  }

  is(code: (typeof PG_ERROR)[keyof typeof PG_ERROR]): boolean {
    return this.code === code;
  }
}

export function isQueryError(value: unknown): value is QueryError {
  return value instanceof QueryError;
}
