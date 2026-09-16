// Runtime knobs for db/queries (ARCHITECTURE.md, Data Model §7). Constraint bounds (score 0-100, depth 1-8, the
// 3 h duration clamp, interval sets, XP ranges) live in supabase/migrations and change by migration, never here.

export interface DbConfig {
  /** AbortSignal timeout for the record_attempt RPC (recordAttempt in db/queries/attempts.ts). */
  readonly rpcTimeoutMs: number;
  /** Upper bound on the serialized RecordAttemptPayload; a Zod refinement rejects larger payloads before the RPC. */
  readonly payloadMaxBytes: number;
  /** Page size for history / attempts listings on /progress. */
  readonly queryPageSize: number;
  /** Mirrors `alter role authenticated set statement_timeout = '8s'` in migration 0002 (asserted by supabase/tests/grants.test.sql). */
  readonly statementTimeoutMs: number;
}

export const DB_CONFIG: DbConfig = {
  rpcTimeoutMs: 15_000,
  payloadMaxBytes: 65_536,
  queryPageSize: 200,
  statementTimeoutMs: 8_000,
};
