// Step machine persistence. complete_read_step is the only step RPC a session may call (read steps only, never a
// lesson status): evaluated steps and lesson completion travel inside record_attempt's stepPatch.
import 'server-only';
import { emptyPayload } from '@/lib/learning-engine/step-machine';
import type { StepPayload, StepState } from '@/lib/learning-engine/types';
import type { Enums, Json, Tables } from '@/types/database';
import { QueryError, type Db } from './client';

export type StepStateRow = Tables<'lesson_step_states'>;
export type LessonProgressRow = Tables<'lesson_progress'>;

export interface CompleteReadStepInput {
  lessonId: string;
  step: Enums<'session_step'>;
  status: Enums<'step_status'>;
  payload?: Json;
  durationMs?: number;
  contentHash?: string;
}

/** 22023 = the client asked for a non-read step or a status other than active/completed/skipped. */
export async function completeReadStep(db: Db, p: CompleteReadStepInput): Promise<void> {
  const { error } = await db.rpc('complete_read_step', {
    p_lesson_id: p.lessonId,
    p_step: p.step,
    p_status: p.status,
    p_payload: p.payload ?? {},
    p_duration_ms: p.durationMs ?? 0,
    // omitted => SQL default null; the generated Args type does not admit an explicit null
    ...(p.contentHash !== undefined ? { p_content_hash: p.contentHash } : {}),
  });
  if (error) throw new QueryError('complete_read_step', error);
}

export async function getStepStates(db: Db, userId: string, lessonId: string): Promise<StepStateRow[]> {
  const { data, error } = await db
    .from('lesson_step_states')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .order('step', { ascending: true });
  if (error) throw new QueryError('lesson_step_states.select', error);
  return data;
}

export async function getLessonProgress(db: Db, userId: string, lessonId: string): Promise<LessonProgressRow | null> {
  const { data, error } = await db.from('lesson_progress').select('*').eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle();
  if (error) throw new QueryError('lesson_progress.get', error);
  return data;
}

export async function listLessonProgress(db: Db, userId: string): Promise<LessonProgressRow[]> {
  const { data, error } = await db.from('lesson_progress').select('*').eq('user_id', userId).order('updated_at', { ascending: true });
  if (error) throw new QueryError('lesson_progress.list', error);
  return data;
}

function isStepPayloadFor(step: Enums<'session_step'>, payload: Json): payload is StepPayload & Json {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) && payload.step === step;
}

/**
 * The engine's StepState. The jsonb payload is owned by the step machine; a row whose payload does not name its
 * own step (legacy or hand-edited) degrades to the empty payload for that step instead of throwing.
 */
export function toStepState(row: StepStateRow): StepState {
  return {
    lessonId: row.lesson_id,
    step: row.step,
    status: row.status,
    enteredAt: row.entered_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    skipReason: row.skip_reason,
    payload: isStepPayloadFor(row.step, row.payload) ? (row.payload as StepPayload) : emptyPayload(row.step),
  };
}
