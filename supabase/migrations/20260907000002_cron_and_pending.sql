-- 0002: the pending-evaluation drain (resolve_pending_evaluation), the session statement timeout and the pg_cron schedules.
-- ARCHITECTURE.md Data Model §3 notes + LLM boundary "Pending-evaluation flow". No new tables.

-- Applies an LLM grade to an existing pending_evaluation row. Security definer: the caller is either the row owner
-- (submitAttempt drains the learner's own oldest pending rows through the session client) or the service_role admin client
-- (GET /api/cron/evaluations, auth.uid() null). Anything else raises 42501.
-- payload has the record_attempt shape: attempt (evaluation columns only), masteryPatches, xpEvents, reviewPatches, stepPatch.
-- The same call records a failed retry (status stays pending_evaluation, retry_count / next_retry_at / failure_reason bumped)
-- or the give-up (needs_review); both carry no patches, so steps 3-6 are no-ops and mastery stays unchanged.
-- XP and review rows are dated with the attempt's own local_date (the study day), so a drain is attributed to the day the
-- work was done and is idempotent regardless of when the cron fires.
create function resolve_pending_evaluation(p_attempt_id bigint, payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_caller uuid := auth.uid(); v_user uuid; v_local date; v_status attempt_status;
  v_a jsonb := payload -> 'attempt'; v_xp integer := 0;
begin
  if jsonb_typeof(v_a) is distinct from 'object' then raise exception 'payload.attempt required' using errcode = '22023'; end if;

  -- 1. owner + status gate. A learner learns nothing about rows that are not theirs (same 42501 for missing and foreign ids).
  select user_id, local_date into v_user, v_local from attempts where id = p_attempt_id and status = 'pending_evaluation' for update;
  if v_user is null then
    if v_caller is null then raise exception 'attempt % is not pending_evaluation', p_attempt_id using errcode = '22023'; end if;
    raise exception 'attempt % is not yours to resolve', p_attempt_id using errcode = '42501';
  end if;
  if v_caller is not null and v_caller <> v_user then
    raise exception 'attempt % is not yours to resolve', p_attempt_id using errcode = '42501'; end if;

  -- 2. evaluation columns only. Identity columns (user_id, client_nonce, kind, lesson/concept, form_key, depth, scorer, answer,
  --    local_date) never move; `passed` travels with the grade because pass-dependent XP is written here, not at submit time.
  update attempts a set
    status = coalesce(r.status, 'evaluated'), score = r.score, correct = r.correct, passed = r.passed,
    verdict = coalesce(r.verdict, 'unknown'), llm_evaluation = r.llm_evaluation, applied_delta = r.applied_delta,
    flags = coalesce(r.flags, '{}'), misconception_ids = coalesce(r.misconception_ids, '{}'),
    retry_count = coalesce(r.retry_count, a.retry_count), next_retry_at = r.next_retry_at, failure_reason = r.failure_reason
  from jsonb_populate_record(null::attempts, v_a) r
  where a.id = p_attempt_id
  returning a.status into v_status;

  -- 3. mastery: whole MasteryState rows replaced, one per concept the attempt evidenced (record_attempt step 3 with v_user)
  if jsonb_typeof(payload -> 'masteryPatches') = 'array' then
    insert into mastery (user_id, concept_id, recall, understanding, application, debugging, architecture, teach_back, overall, band,
                         cap_reason, evidence_count, state)
    select v_user, m.concept_id, m.recall, m.understanding, m.application, m.debugging, m.architecture, m.teach_back, m.overall, m.band,
           m.cap_reason, coalesce(m.evidence_count, 0), coalesce(m.state, '{}'::jsonb)
    from jsonb_populate_recordset(null::mastery, payload -> 'masteryPatches') m
    on conflict (user_id, concept_id) do update set recall = excluded.recall, understanding = excluded.understanding,
      application = excluded.application, debugging = excluded.debugging, architecture = excluded.architecture,
      teach_back = excluded.teach_back, overall = excluded.overall, band = excluded.band, cap_reason = excluded.cap_reason,
      evidence_count = excluded.evidence_count, state = excluded.state;
  end if;

  -- 4. XP ledger: the pass-dependent events deferred at submit time; once-only refs collide on xp_once_per_ref and are dropped
  with ev as (select * from jsonb_to_recordset(case when jsonb_typeof(payload -> 'xpEvents') = 'array' then payload -> 'xpEvents' else '[]'::jsonb end)
                as e(reason xp_reason, ref text, base integer, multiplier numeric, amount integer)),
       ins as (insert into xp_transactions (user_id, attempt_id, reason, ref, base, multiplier, amount, local_date)
               select v_user, p_attempt_id, reason, ref, base, coalesce(multiplier, 1.00), amount, v_local from ev
               on conflict do nothing returning 1)
  select count(*) into v_xp from ins;

  -- 5. review items: one live item per (user, concept); due_on defaults to local_date + interval_days
  if jsonb_typeof(payload -> 'reviewPatches') = 'array' then
    insert into review_items (user_id, concept_id, dimension, depth, question_type, angle, exclude_form_keys, due_on, interval_days,
                              last_outcome, review_count, lapses, reason)
    select v_user, r.concept_id, r.dimension, r.depth, r.question_type, r.angle, coalesce(r.exclude_form_keys, '{}'),
           coalesce(r.due_on, v_local + r.interval_days), r.interval_days, r.last_outcome, coalesce(r.review_count, 0), coalesce(r.lapses, 0), r.reason
    from jsonb_populate_recordset(null::review_items, payload -> 'reviewPatches') r
    on conflict (user_id, concept_id) do update set dimension = excluded.dimension, depth = excluded.depth,
      question_type = excluded.question_type, angle = excluded.angle, exclude_form_keys = excluded.exclude_form_keys,
      due_on = excluded.due_on, interval_days = excluded.interval_days, last_outcome = excluded.last_outcome,
      review_count = excluded.review_count, lapses = excluded.lapses, reason = excluded.reason;
  end if;

  -- 6. step machine: the step parked as pending_evaluation at submit time completes (or stays parked) in the same transaction
  if jsonb_typeof(payload -> 'stepPatch') = 'object' then
    perform advance_step(v_user, payload #>> '{stepPatch,lesson_id}', (payload #>> '{stepPatch,step}')::session_step,
      (payload #>> '{stepPatch,status}')::step_status, coalesce(payload #> '{stepPatch,payload}', '{}'::jsonb),
      coalesce((payload #>> '{stepPatch,duration_ms}')::integer, 0), (payload #>> '{stepPatch,skip_reason}')::skip_reason,
      (payload #>> '{stepPatch,lesson_status}')::lesson_status, (payload #>> '{stepPatch,flex_action}')::flex_action,
      payload #>> '{stepPatch,content_hash}');
  end if;

  return jsonb_build_object('attemptId', p_attempt_id, 'insertedXp', v_xp, 'status', v_status);
end $$;

revoke execute on function resolve_pending_evaluation(bigint, jsonb) from public, anon;
grant  execute on function resolve_pending_evaluation(bigint, jsonb) to authenticated, service_role;

-- session statement timeout; db/config.ts statementTimeoutMs mirrors this value (asserted in grants.test.sql)
alter role authenticated set statement_timeout = '8s';

-- pg_cron: both cron routes, hourly. Site URL and secret come from Vault (names cron_site_url, cron_secret) so the migration is
-- environment-neutral: without those rows the job's WHERE clause yields no row and net.http_post is never invoked (posts nowhere,
-- never errors). Without pg_cron (or pg_net) the block logs a notice and the reset succeeds; Vercel Cron remains the daily sweep.
-- The job text uses net.http_post as decided in CLAUDE.md (Scheduler); the routes honor CRON_SECRET, not the verb.
do $$
declare
  v_job text := $job$
    select net.http_post(
      url := s.site_url || '%s',
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.secret, 'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000)
    from (select (select decrypted_secret from vault.decrypted_secrets where name = 'cron_site_url') as site_url,
                 (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')   as secret) s
    where s.site_url is not null and s.secret is not null
  $job$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed: reminders-hourly / evaluations-hourly not scheduled';
    return;
  end if;
  perform cron.schedule('reminders-hourly',   '0 * * * *',  format(v_job, '/api/cron/reminders'));
  perform cron.schedule('evaluations-hourly', '30 * * * *', format(v_job, '/api/cron/evaluations'));
exception when others then
  raise notice 'cron scheduling skipped (% %)', sqlstate, sqlerrm;
end $$;
