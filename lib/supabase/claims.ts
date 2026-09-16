// The one way a Server Action or Route Handler learns who is calling: verified JWT claims, never input.
// Structural `ClaimsSource` so both `SupabaseClient` (lib/supabase/server.ts) and a test double satisfy it;
// no 'server-only' here because the file has no server dependency and is unit-tested directly.

export interface ClaimsSource {
  auth: {
    getClaims(): Promise<{
      data: { claims: { sub?: string } } | null;
      error: { message: string } | null;
    }>;
  };
}

/** Mapped by Server Actions to `ActionResult` code `'unauthenticated'` (lib/action-result.ts). */
export class UnauthenticatedError extends Error {
  readonly code = 'unauthenticated' as const;

  constructor(detail?: string) {
    super(detail ? `unauthenticated: ${detail}` : 'unauthenticated');
    this.name = 'UnauthenticatedError';
  }
}

/**
 * `{ userId }` from the verified `sub` claim. Anything else (no session, SDK error, JWKS fetch failure, missing
 * or empty `sub`) throws `UnauthenticatedError`; a user id is never derived from request input.
 */
export async function requireUserId(supabase: ClaimsSource): Promise<{ userId: string }> {
  let result: Awaited<ReturnType<ClaimsSource['auth']['getClaims']>>;
  try {
    result = await supabase.auth.getClaims();
  } catch (cause) {
    throw new UnauthenticatedError(cause instanceof Error ? cause.message : 'getClaims failed');
  }
  if (result.error) throw new UnauthenticatedError(result.error.message);
  const sub = result.data?.claims.sub;
  if (typeof sub !== 'string' || sub.length === 0) throw new UnauthenticatedError();
  return { userId: sub };
}
