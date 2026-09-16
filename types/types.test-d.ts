// types/types.test-d.ts (vitest typecheck): the generated surface db/queries depends on, and the seams where engine
// output flows into the record_attempt payload unchanged. A regenerated types/database.ts that breaks one of these
// fails typecheck before any page does.
import { expectTypeOf } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AttemptInsert, MasteryPatchRow, RecordAttemptPayload, ReviewPatchRow, XpEventRow } from '../db/queries/attempts.ts';
import type { Db } from '../db/queries/client.ts';
import type { XpEvent } from '../lib/gamification/types.ts';
import type { MasteryPatch, MasteryRowLike } from '../lib/mastery-engine/state.ts';
import type { ReviewPatch } from '../lib/spaced-repetition/patch.ts';
import type { ClaimsSource } from '../lib/supabase/claims.ts';
import type { Database, Enums, Json, Tables, TablesInsert } from './database.ts';

// --- generated surface -----------------------------------------------------------------------------------------
expectTypeOf<Tables<'attempts'>['id']>().toEqualTypeOf<number>();
expectTypeOf<Tables<'attempts'>['llm_evaluation']>().toEqualTypeOf<Json | null>();
expectTypeOf<Tables<'attempts'>['status']>().toEqualTypeOf<Enums<'attempt_status'>>();
expectTypeOf<Tables<'mastery'>['state']>().toEqualTypeOf<Json>();
expectTypeOf<Tables<'review_items'>['due_on']>().toEqualTypeOf<string>();
expectTypeOf<TablesInsert<'attempts'>['id']>().toEqualTypeOf<never | undefined>();
expectTypeOf<Database['public']['Views']['v_qualifying_days']['Row']>().toEqualTypeOf<{ local_date: string | null; user_id: string | null }>();
expectTypeOf<Database['public']['Functions']['record_attempt']['Args']>().toEqualTypeOf<{ payload: Json }>();
expectTypeOf<Database['public']['Functions']['record_attempt']['Returns']>().toEqualTypeOf<Json>();
expectTypeOf<Database['public']['Functions']['resolve_pending_evaluation']['Args']>().toEqualTypeOf<{ p_attempt_id: number; payload: Json }>();
expectTypeOf<Database['public']['Functions']['reserve_llm_call']['Args']>().toEqualTypeOf<{ p_plan_limits: Json }>();
expectTypeOf<Database['public']['Functions']['check_llm_quota']['Args']>().toEqualTypeOf<{ p_plan_limits: Json }>();
expectTypeOf<Database['public']['Functions']['complete_read_step']['Args']['p_step']>().toEqualTypeOf<Enums<'session_step'>>();
expectTypeOf<Database['public']['Functions']['complete_read_step']['Args']['p_status']>().toEqualTypeOf<Enums<'step_status'>>();
// advance_step exists but no API role may execute it; the queries never call it.
expectTypeOf<Database['public']['Functions']['advance_step']['Args']>().toHaveProperty('p_user');

// --- payload contract: identity columns never travel ---------------------------------------------------------------
expectTypeOf<AttemptInsert>().not.toHaveProperty('user_id');
expectTypeOf<AttemptInsert>().not.toHaveProperty('local_date');
expectTypeOf<AttemptInsert>().not.toHaveProperty('id');
expectTypeOf<AttemptInsert>().not.toHaveProperty('created_at');
expectTypeOf<MasteryPatchRow>().not.toHaveProperty('user_id');
expectTypeOf<ReviewPatchRow>().not.toHaveProperty('user_id');
expectTypeOf<ReviewPatchRow>().not.toHaveProperty('id');
expectTypeOf<RecordAttemptPayload['xpEvents']>().toEqualTypeOf<XpEventRow[]>();

// --- engine output feeds the payload without conversion -----------------------------------------------------------
expectTypeOf<MasteryPatch>().toExtend<MasteryPatchRow>();
expectTypeOf<ReviewPatch>().toExtend<ReviewPatchRow>();
expectTypeOf<XpEvent>().toExtend<XpEventRow>();
// and the generated row feeds the engine's parser without conversion
expectTypeOf<Tables<'mastery'>>().toExtend<MasteryRowLike>();

// --- clients -----------------------------------------------------------------------------------------------------
expectTypeOf<Db>().toEqualTypeOf<SupabaseClient<Database>>();
expectTypeOf<Db>().toExtend<ClaimsSource>();
