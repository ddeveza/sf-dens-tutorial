// Shared return shape for every Server Action. Expected failures are values, never thrown.
export type ActionErrorCode =
  | 'unauthenticated'
  | 'invalid_input'
  | 'quota_exceeded'
  | 'pending_evaluation'
  | 'duplicate'
  | 'not_found'
  | 'internal';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string; retryAfterSec?: number };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(code: ActionErrorCode, message: string, retryAfterSec?: number): ActionResult<T> {
  return retryAfterSec === undefined ? { ok: false, code, message } : { ok: false, code, message, retryAfterSec };
}
