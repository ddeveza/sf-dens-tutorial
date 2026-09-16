// record_attempt: one attempt = one transaction (ARCHITECTURE.md Data Model §3, §6). The payload keys are the generated
// TablesInsert shapes (snake_case) so a column added by migration reaches the function with no TS edit; the Zod schema
// below is what Server Actions parse before the RPC (bounds mirror the migration's check constraints, §7).
import 'server-only';
import { z } from 'zod';
import { DB_CONFIG } from '@/db/config';
import { ATTEMPT_KINDS, ATTEMPT_STATUSES, LLM_CLASSES, SCORER_KINDS } from '@/lib/assessments/types';
import { BOSS_KINDS, XP_REASONS } from '@/lib/gamification/types';
import { LEARNING_CONFIG } from '@/lib/learning-engine/config';
import {
  FLEX_ACTIONS,
  LESSON_STATUSES,
  PROBE_ANGLES,
  QUESTION_TYPES,
  SESSION_STEPS,
  SKIP_REASONS,
  STEP_STATUSES,
} from '@/lib/learning-engine/types';
import { Score } from '@/lib/llm/schemas';
import { BANDS, CAP_REASONS, CONFIDENCE_VERDICTS, DIMENSIONS } from '@/lib/mastery-engine/types';
import { INTERVAL_DAYS, REVIEW_OUTCOMES, REVIEW_REASONS } from '@/lib/spaced-repetition/types';
import type { Enums, Json, Tables, TablesInsert } from '@/types/database';
import { QueryError, type Db } from './client';

export type AttemptRow = Tables<'attempts'>;

// ---------------------------------------------------------------------------------------------------------------
// Payload contract (ARCHITECTURE.md Data Model §6). `user_id` and `local_date` are the function's, never the caller's.
// ---------------------------------------------------------------------------------------------------------------

/** concept_ids[] for boss/capstone; concept_id null for them. */
export type AttemptInsert = Omit<TablesInsert<'attempts'>, 'id' | 'user_id' | 'local_date' | 'created_at'>;
/** One whole row per concept evidenced; record_attempt replaces, never adds deltas. */
export type MasteryPatchRow = Omit<TablesInsert<'mastery'>, 'user_id' | 'created_at' | 'updated_at'>;
/** `due_on` optional: SQL defaults it to local_date + interval_days (pure date arithmetic). */
export type ReviewPatchRow = Omit<TablesInsert<'review_items'>, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'due_on'> & {
  due_on?: string | null;
};
export type XpEventRow = Pick<TablesInsert<'xp_transactions'>, 'reason' | 'ref' | 'base' | 'multiplier' | 'amount'>;
export interface StepPatch {
  lesson_id: string;
  step: Enums<'session_step'>;
  status: Enums<'step_status'>;
  payload?: Json;
  duration_ms?: number;
  skip_reason?: Enums<'skip_reason'> | null;
  lesson_status?: Enums<'lesson_status'> | null;
  flex_action?: Enums<'flex_action'> | null;
  content_hash?: string | null;
}

export interface RecordAttemptPayload {
  attempt: AttemptInsert;
  masteryPatches: MasteryPatchRow[] | null;
  reviewPatches: ReviewPatchRow[] | null;
  xpEvents: XpEventRow[];
  stepPatch: StepPatch | null;
  /** Informational only: reserve_llm_call already billed the call. */
  llmCalls: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Zod mirror for Server Actions. Bounds are the migration's constraint bounds (Data Model §7), not tunables.
// ---------------------------------------------------------------------------------------------------------------

/** `Json` as the generator declares it; `z.lazy` keeps the output type identical to the generated alias. */
export const JsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonSchema), z.record(z.string(), JsonSchema)]),
);

const NonNegativeInt = z.number().int().min(0);
const Depth = z.number().int().min(1).max(8);
const XP_BASE_MAX = 5000;
const XP_AMOUNT_ABS_MAX = 5000;
const XP_MULTIPLIER_MAX = 4;

const AttemptInsertSchema = z.object({
  answer: JsonSchema,
  applied_delta: z.number().int().nullable().optional(),
  boss_kind: z.enum(BOSS_KINDS).nullable().optional(),
  boss_ref: z.string().nullable().optional(),
  chain_rung: z.number().int().min(1).max(5).nullable().optional(),
  // z.guid(), not z.uuid(): Postgres `uuid` accepts any 8-4-4-4-12 hex (the pgTAP fixtures use 1111…), while
  // Zod's uuid() additionally enforces the RFC 4122 version/variant nibbles.
  client_nonce: z.guid(),
  concept_id: z.string().nullable().optional(),
  concept_ids: z.array(z.string()).optional(),
  correct: z.boolean().nullable().optional(),
  depth: Depth,
  dimension: z.enum(DIMENSIONS).nullable().optional(),
  duration_ms: z.number().int().min(0).max(LEARNING_CONFIG.serverClampMs).optional(),
  exercise_id: z.string().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
  flags: z.array(z.string()).optional(),
  form_key: z.string().min(1),
  kind: z.enum(ATTEMPT_KINDS),
  lesson_id: z.string().nullable().optional(),
  llm_class: z.enum(LLM_CLASSES).nullable().optional(),
  llm_evaluation: JsonSchema.nullable().optional(),
  misconception_ids: z.array(z.string()).optional(),
  next_retry_at: z.iso.datetime({ offset: true }).nullable().optional(),
  passed: z.boolean().nullable().optional(),
  probe_angle: z.enum(PROBE_ANGLES).nullable().optional(),
  question_type: z.enum(QUESTION_TYPES),
  retry_count: NonNegativeInt.optional(),
  review_item_id: z.guid().nullable().optional(),
  score: Score.nullable().optional(),
  scorer: z.enum(SCORER_KINDS),
  self_confidence: z.number().int().min(1).max(5).nullable().optional(),
  status: z.enum(ATTEMPT_STATUSES).optional(),
  step: z.enum(SESSION_STEPS).nullable().optional(),
  verdict: z.enum(CONFIDENCE_VERDICTS).optional(),
});

const MasteryPatchSchema = z.object({
  concept_id: z.string().min(1),
  recall: Score.optional(),
  understanding: Score.optional(),
  application: Score.optional(),
  debugging: Score.optional(),
  architecture: Score.optional(),
  teach_back: Score.optional(),
  overall: Score.optional(),
  band: z.enum(BANDS).optional(),
  cap_reason: z.enum(CAP_REASONS).nullable().optional(),
  evidence_count: NonNegativeInt.optional(),
  state: JsonSchema.optional(),
});

const ReviewPatchSchema = z.object({
  concept_id: z.string().min(1),
  dimension: z.enum(DIMENSIONS),
  depth: Depth,
  question_type: z.enum(QUESTION_TYPES),
  angle: z.enum(PROBE_ANGLES).nullable().optional(),
  exclude_form_keys: z.array(z.string()).optional(),
  due_on: z.iso.date().nullable().optional(),
  interval_days: z.literal([...INTERVAL_DAYS]),
  last_outcome: z.enum(REVIEW_OUTCOMES).nullable().optional(),
  review_count: NonNegativeInt.optional(),
  lapses: NonNegativeInt.optional(),
  reason: z.enum(REVIEW_REASONS),
});

const XpEventSchema = z.object({
  reason: z.enum(XP_REASONS),
  ref: z.string().nullable().optional(),
  base: z.number().int().min(0).max(XP_BASE_MAX),
  multiplier: z.number().min(0).max(XP_MULTIPLIER_MAX).optional(),
  amount: z.number().int().min(-XP_AMOUNT_ABS_MAX).max(XP_AMOUNT_ABS_MAX),
});

const StepPatchSchema = z.object({
  lesson_id: z.string().min(1),
  step: z.enum(SESSION_STEPS),
  status: z.enum(STEP_STATUSES),
  payload: JsonSchema.optional(),
  duration_ms: z.number().int().min(0).max(LEARNING_CONFIG.serverClampMs).optional(),
  skip_reason: z.enum(SKIP_REASONS).nullable().optional(),
  lesson_status: z.enum(LESSON_STATUSES).nullable().optional(),
  flex_action: z.enum(FLEX_ACTIONS).nullable().optional(),
  content_hash: z.string().nullable().optional(),
});

/** UTF-8 byte length of the JSON the RPC would send. */
export function payloadByteLength(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

export const RecordAttemptPayloadSchema = z
  .object({
    attempt: AttemptInsertSchema,
    masteryPatches: z.array(MasteryPatchSchema).nullable(),
    reviewPatches: z.array(ReviewPatchSchema).nullable(),
    xpEvents: z.array(XpEventSchema),
    stepPatch: StepPatchSchema.nullable(),
    llmCalls: NonNegativeInt,
  })
  .refine((payload) => payloadByteLength(payload) <= DB_CONFIG.payloadMaxBytes, {
    message: `payload exceeds payloadMaxBytes (${DB_CONFIG.payloadMaxBytes})`,
  });

/** Compile-time proof that what the schema emits is what the RPC accepts. */
export type ParsedRecordAttemptPayload = z.infer<typeof RecordAttemptPayloadSchema>;
const _assignable: RecordAttemptPayload = null as unknown as ParsedRecordAttemptPayload;
void _assignable;

// ---------------------------------------------------------------------------------------------------------------
// RPC + readers
// ---------------------------------------------------------------------------------------------------------------

const RecordAttemptResultSchema = z.object({
  attemptId: z.number().int(),
  insertedXp: z.number().int(),
  duplicate: z.boolean(),
});
export type RecordAttemptResult = z.infer<typeof RecordAttemptResultSchema>;

/**
 * The only writer of attempts / mastery / review_items / xp_transactions from a session. Idempotent on
 * `attempt.client_nonce` (`duplicate: true` returns the stored attempt). A concurrent twin raises 23505, which the
 * Server Action maps to `duplicate` and re-reads with getAttemptByNonce.
 */
export async function recordAttempt(
  db: Db,
  payload: RecordAttemptPayload,
  options: { timeoutMs?: number } = {},
): Promise<RecordAttemptResult> {
  const { data, error } = await db
    .rpc('record_attempt', { payload: payload as unknown as Json }) // generated Args are { payload: Json }
    .abortSignal(AbortSignal.timeout(options.timeoutMs ?? DB_CONFIG.rpcTimeoutMs));
  if (error) throw new QueryError('record_attempt', error);
  return RecordAttemptResultSchema.parse(data); // generated Returns is Json; parse, never cast
}

export async function getAttemptByNonce(db: Db, userId: string, clientNonce: string): Promise<AttemptRow | null> {
  const { data, error } = await db.from('attempts').select('*').eq('user_id', userId).eq('client_nonce', clientNonce).maybeSingle();
  if (error) throw new QueryError('attempts.by_nonce', error);
  return data;
}

export async function getAttemptById(db: Db, userId: string, attemptId: number): Promise<AttemptRow | null> {
  const { data, error } = await db.from('attempts').select('*').eq('user_id', userId).eq('id', attemptId).maybeSingle();
  if (error) throw new QueryError('attempts.by_id', error);
  return data;
}

/** Every attempt of the learner, ascending by created_at (the order GamificationContext expects). */
export async function listAttemptsForUser(db: Db, userId: string, options: { limit?: number } = {}): Promise<AttemptRow[]> {
  let query = db.from('attempts').select('*').eq('user_id', userId).order('created_at', { ascending: true }).order('id', { ascending: true });
  if (options.limit !== undefined) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new QueryError('attempts.list', error);
  return data;
}

/** Latest attempts on one concept (hits attempts_user_concept_created). */
export async function listAttemptsForConcept(db: Db, userId: string, conceptId: string, limit: number): Promise<AttemptRow[]> {
  const { data, error } = await db
    .from('attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('concept_id', conceptId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new QueryError('attempts.by_concept', error);
  return data;
}

/** Attempts inside one lesson (warm-up, assessment and review steps included), ascending. */
export async function listAttemptsForLesson(db: Db, userId: string, lessonId: string): Promise<AttemptRow[]> {
  const { data, error } = await db
    .from('attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true });
  if (error) throw new QueryError('attempts.by_lesson', error);
  return data;
}

/** Form keys the learner passed recently (identical-form rule); newest first, hits attempts_user_form_key. */
export async function listRecentPassedFormKeys(db: Db, userId: string, sinceIso: string, limit: number): Promise<string[]> {
  const { data, error } = await db
    .from('attempts')
    .select('form_key')
    .eq('user_id', userId)
    .eq('correct', true)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new QueryError('attempts.recent_form_keys', error);
  return data.map((row) => row.form_key);
}
