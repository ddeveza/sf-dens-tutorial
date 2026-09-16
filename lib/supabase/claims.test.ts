import { describe, expect, it } from 'vitest';
import { UnauthenticatedError, requireUserId, type ClaimsSource } from './claims.ts';

function source(result: Awaited<ReturnType<ClaimsSource['auth']['getClaims']>>): ClaimsSource {
  return { auth: { getClaims: async () => result } };
}

describe('requireUserId', () => {
  it('returns the sub claim as userId', async () => {
    const db = source({ data: { claims: { sub: '00000000-0000-0000-0000-00000000000a' } }, error: null });
    await expect(requireUserId(db)).resolves.toEqual({ userId: '00000000-0000-0000-0000-00000000000a' });
  });

  it('throws UnauthenticatedError when there is no session', async () => {
    const db = source({ data: null, error: null });
    await expect(requireUserId(db)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('throws UnauthenticatedError when the SDK reports an error (expired or unverifiable token)', async () => {
    const db = source({ data: null, error: { message: 'invalid JWT' } });
    const err = await requireUserId(db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthenticatedError);
    expect((err as UnauthenticatedError).message).toContain('invalid JWT');
  });

  it('throws UnauthenticatedError when the sub claim is missing or not a string', async () => {
    await expect(requireUserId(source({ data: { claims: {} }, error: null }))).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(requireUserId(source({ data: { claims: { sub: '' } }, error: null }))).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('never resolves a userId from anything but the verified claims', async () => {
    // A getClaims implementation that throws (network failure while fetching JWKS) surfaces as unauthenticated,
    // never as a userId taken from elsewhere.
    const db: ClaimsSource = {
      auth: {
        getClaims: async () => {
          throw new Error('jwks fetch failed');
        },
      },
    };
    await expect(requireUserId(db)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('UnauthenticatedError is a named Error subclass so Server Actions can map it to ActionResult', () => {
    const err = new UnauthenticatedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UnauthenticatedError');
    expect(err.code).toBe('unauthenticated');
  });
});
