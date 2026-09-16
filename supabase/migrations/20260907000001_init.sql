-- 0001 init: the complete Phase 1 schema (ARCHITECTURE.md, Data Model §3). Postgres stores and constrains; it never computes
-- mastery, XP, intervals or streaks. Engines send finished rows and security definer functions write them atomically.
-- The only numbers here are constraint bounds (Data Model §7); they change by migration, never at runtime.

-- extensions. pg_cron schedules live in 0002 and read the site URL + secret from Vault. Guarded: an image without
-- pg_net / pg_cron logs a notice instead of failing the reset (the app is unaffected; only the hourly HTTP posts are).
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net not available (% %): skipped', sqlstate, sqlerrm;
end $$;
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception when others then
  raise notice 'pg_cron not available (% %): skipped', sqlstate, sqlerrm;
end $$;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
  end if;
exception when others then
  raise notice 'cron schema grants skipped (% %)', sqlstate, sqlerrm;
end $$;

-- enums = engine unions (lib/*/types.ts); types.test-d.ts asserts equality for every one of them
create type mastery_band       as enum ('lost','familiar','developing','competent','strong','mastered');
create type mastery_dimension  as enum ('recall','understanding','application','debugging','architecture','teach_back');
create type cap_reason         as enum ('recall_only','no_understanding','no_application_or_debugging','no_optimize_evidence','no_design_evidence',
  'mastered_gate','min_evidence');
create type question_type      as enum ('mcq','multi_select','true_false','predict_outcome','order_execution','debug_code',
  'find_anti_pattern','explain_why','compare_approaches','architecture_decision','fix_design','scenario_diagnosis','teach_back',
  'lab','boss','capstone');                                              -- one spelling everywhere: predict_outcome, never 'predict'
create type attempt_kind       as enum ('question','prediction','explain_why','teach_back','scenario','lab','boss','capstone');
  -- kind = attemptKindFor(question_type) in lib/assessments: deterministic -> question; predict_outcome -> prediction; explain_why;
  -- teach_back; scenario_diagnosis/architecture_decision/compare_approaches/fix_design -> scenario; lab; boss; capstone
create type attempt_status     as enum ('evaluated','pending_evaluation','needs_review');
create type scorer_kind        as enum ('deterministic','llm');
create type confidence_verdict as enum ('calibrated','suspicious','overconfident','underconfident','unknown');
create type probe_angle        as enum ('why','what_if','what_breaks','what_would_you_change','explain_without_jargon','explain_to_junior','predict');
create type boss_kind          as enum ('mission','weekly','capstone');
create type review_outcome     as enum ('fail','struggle','strong','mastered');
create type review_reason      as enum ('weak_dimension','failed_attempt','skipped_with_gap','scheduled');
create type session_step       as enum ('warmup','curiosity','problem','caveman','technical','simulation','prediction',
  'hands_on','teach_back','assessment','spaced_review','real_world_scenario');
create type step_status        as enum ('locked','available','active','awaiting_prediction','predicted','revealed',
  'submitted','pending_evaluation','completed','skipped');
create type skip_reason        as enum ('confident','challenge_gate','move_on');
create type flex_action        as enum ('continue','challenge_me','review_weakness','next_mission');
create type lesson_status      as enum ('not_started','in_progress','completed','completed_early','skipped_with_gap');
create type xp_reason as enum (
  'answer_correct', 'prediction_correct', 'explain_why_passed', 'teach_back_passed',
  'scenario_passed', 'lab_completed', 'review_answered', 'review_correct',
  'lesson_completed', 'band_reached',
  'mission_boss_attempted', 'mission_boss_defeated',
  'weekly_boss_attempted', 'weekly_boss_defeated',
  'capstone_attempted', 'capstone_passed',
  'achievement_unlocked', 'manual_adjustment');

-- curriculum registry (written only by scripts/sync-curriculum.ts through db/admin.ts; the sync also checks (release, api_version) against data/releases.ts)
create table skills   (id text primary key, ordinal int not null unique, label text not null);
insert into skills (id, ordinal, label) values ('platform',1,'Platform Knowledge'),('data',2,'Data Architecture'),
  ('security',3,'Security'),('apex',4,'Apex & Automation'),('integration',5,'Integration'),('architecture',6,'Architecture');
create table worlds   (id text primary key, ordinal int not null unique, title text not null,
                       skill text not null references skills (id), retired_at timestamptz);
create table missions (id text primary key, world_id text not null references worlds, ordinal int not null, title text not null,
                       boss_lesson_id text, retired_at timestamptz, unique (world_id, ordinal));
create table lessons  (id text primary key, mission_id text not null references missions, day int not null check (day between 1 and 180),
                       kind text not null check (kind in ('lesson','lab','side_quest','boss','capstone')),   -- weekly bosses are templates, not lessons
                       visibility text not null check (visibility in ('core','side','hidden')), ordinal int not null, title text not null,
                       release text not null, api_version text not null, content_hash text not null, retired_at timestamptz,
                       unique (mission_id, ordinal));
create table concepts (id text primary key, parent_id text references concepts, world_id text not null references worlds,
                       title text not null, skill text not null references skills (id), retired_at timestamptz);
create table lesson_concepts (lesson_id text references lessons, concept_id text references concepts, is_primary boolean not null default false,
                       primary key (lesson_id, concept_id));
create table concept_skills (concept_id text references concepts, skill_id text references skills,
                       weight numeric(3,2) not null check (weight > 0 and weight <= 1), primary key (concept_id, skill_id));

-- learner state
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,                                                          -- nullable: OAuth without an email scope; reminder cron skips null/empty
  display_name text not null default '',
  time_zone   text not null default 'UTC',                                   -- the only zone column; IANA name, validated by trigger (Server Action pre-checks)
  plan        text not null default 'personal' check (plan in ('personal','free','team')),   -- admin-owned (column grant below)
  explanation_mode_default text not null default 'caveman' check (explanation_mode_default in ('caveman','technical')),
  created_at  timestamptz not null default now(), updated_at timestamptz not null default now());

create table notification_preferences (user_id uuid primary key references auth.users on delete cascade, enabled boolean not null default false,
  preferred_hour int not null default 19 check (preferred_hour between 0 and 23),           -- interpreted in profiles.time_zone
  frequency text not null default 'daily' check (frequency in ('daily','weekdays')),
  streak_reminder boolean not null default true, review_due_reminder boolean not null default true, updated_at timestamptz not null default now());

create table llm_usage (user_id uuid not null references auth.users (id) on delete cascade, hour_bucket timestamptz not null,
  count int not null default 0 check (count >= 0), primary key (user_id, hour_bucket));

create table lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade, lesson_id text not null references lessons (id),
  status lesson_status not null default 'not_started', current_step session_step not null default 'warmup',
  started_at timestamptz, completed_at timestamptz, flex_action_last flex_action,
  content_hash_seen text, updated_at timestamptz not null default now(), primary key (user_id, lesson_id));

create table lesson_step_states (
  user_id uuid not null references auth.users (id) on delete cascade, lesson_id text not null references lessons (id),
  step session_step not null, status step_status not null default 'locked', entered_at timestamptz, completed_at timestamptz,
  duration_ms integer not null default 0 check (duration_ms between 0 and 10800000), skip_reason skip_reason,
  payload jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id, step));                                  -- the required unique (user_id, lesson_id, step)

create table mastery (
  user_id uuid not null references auth.users (id) on delete cascade, concept_id text not null references concepts (id),
  recall smallint not null default 0 check (recall between 0 and 100),
  understanding smallint not null default 0 check (understanding between 0 and 100),
  application smallint not null default 0 check (application between 0 and 100),
  debugging smallint not null default 0 check (debugging between 0 and 100),
  architecture smallint not null default 0 check (architecture between 0 and 100),
  teach_back smallint not null default 0 check (teach_back between 0 and 100),
  overall smallint not null default 0 check (overall between 0 and 100),
  band mastery_band not null default 'lost', cap_reason cap_reason,
  evidence_count integer not null default 0 check (evidence_count >= 0),     -- denormalised from state.dims for coverage queries
  state jsonb not null default '{}'::jsonb,                                  -- dims counts/depths, held, chainRung, recent keys, weakAreas
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, concept_id));                                        -- the required unique (user_id, concept_id)

create table review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade, concept_id text not null references concepts (id),
  dimension mastery_dimension not null, depth smallint not null check (depth between 1 and 8),
  question_type question_type not null, angle probe_angle, exclude_form_keys text[] not null default '{}',
  due_on date not null,                                                      -- learner-local date = local_date + interval_days; no instants, no DST arithmetic
  interval_days smallint not null check (interval_days in (1,3,7,21,30)),
  last_outcome review_outcome, review_count integer not null default 0, lapses integer not null default 0,
  reason review_reason not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, concept_id));

create table attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_nonce uuid not null, kind attempt_kind not null, step session_step,
  lesson_id text references lessons (id), concept_id text references concepts (id),      -- concept null for boss/capstone: they fan out over concept_ids
  concept_ids text[] not null default '{}',                                             -- every concept a boss/capstone attempt evidenced (audit + mastery fan-out)
  exercise_id text, form_key text not null, question_type question_type not null,
  dimension mastery_dimension,                                                          -- null for boss/capstone (the rubric maps to four dimensions)
  depth smallint not null check (depth between 1 and 8), scorer scorer_kind not null,
  answer jsonb not null, score smallint check (score between 0 and 100), correct boolean, passed boolean,
  self_confidence smallint check (self_confidence between 1 and 5), verdict confidence_verdict not null default 'unknown',
  probe_angle probe_angle, chain_rung smallint check (chain_rung between 1 and 5),
  review_item_id uuid references review_items (id) on delete set null,
  boss_kind boss_kind, boss_ref text, llm_class text check (llm_class in ('check','probe','boss','capstone')),
  llm_evaluation jsonb,                       -- raw parsed output; bosses carry `defeated` = lib/gamification/bosses.isDefeated(rubric, kind, config),
                                              -- merged by submitAttempt before the RPC; SQL reads it, never recomputes it
  applied_delta smallint, flags text[] not null default '{}', misconception_ids text[] not null default '{}',
  status attempt_status not null default 'evaluated', failure_reason text,
  retry_count smallint not null default 0, next_retry_at timestamptz,
  duration_ms integer not null default 0 check (duration_ms between 0 and 10800000),
  local_date date not null, created_at timestamptz not null default now(),
  unique (user_id, client_nonce),
  check ((kind in ('boss','capstone')) = (boss_kind is not null)), check ((boss_kind is null) = (boss_ref is null)),
  check ((kind in ('boss','capstone')) = (dimension is null)), check ((kind in ('boss','capstone')) = (concept_id is null)),
  check (kind not in ('boss','capstone') or cardinality(concept_ids) > 0),
  check (boss_kind is distinct from 'weekly' or lesson_id is null),         -- weekly boss: boss_ref = 'weekly-w<NN>', no lesson row
  check (status = 'evaluated' or scorer = 'llm'));

create table xp_transactions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  attempt_id  bigint references attempts (id) on delete set null,
  reason      xp_reason not null,
  ref         text,
  base        integer not null check (base between 0 and 5000),
  multiplier  numeric(4,2) not null default 1.00 check (multiplier between 0 and 4),
  amount      integer not null check (amount between -5000 and 5000),
  local_date  date not null,
  created_at  timestamptz not null default now());
create unique index xp_once_per_ref on xp_transactions (user_id, reason, ref)
  where reason in ('lesson_completed','band_reached','lab_completed',
    'mission_boss_attempted','mission_boss_defeated','weekly_boss_attempted','weekly_boss_defeated',
    'capstone_attempted','capstone_passed','achievement_unlocked');
alter table xp_transactions add constraint xp_ref_required check (ref is not null or reason in
  ('answer_correct','prediction_correct','explain_why_passed','teach_back_passed','scenario_passed','review_answered','review_correct','manual_adjustment'));

create table notification_log (id bigint generated always as identity primary key, user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('daily_reminder','review_due','streak_at_risk')), local_date date not null,   -- local_date in profiles.time_zone
  provider text not null, provider_message_id text, status text not null check (status in ('sent','failed')), error text,
  created_at timestamptz not null default now(), unique (user_id, kind, local_date));

-- indexes: every user_id not already leading a PK/unique, every set-null FK, plus the hot lookups
create index attempts_user_concept_created on attempts (user_id, concept_id, created_at desc);
create index attempts_user_local_date      on attempts (user_id, local_date);
create index attempts_user_exercise        on attempts (user_id, exercise_id);                     -- attemptMultiplier
create index attempts_user_form_key        on attempts (user_id, form_key, created_at desc);       -- identical-form rule (recentPassedFormKeys)
create index attempts_user_lesson          on attempts (user_id, lesson_id);
create index attempts_pending              on attempts (user_id, next_retry_at) where status = 'pending_evaluation';
create index attempts_boss                 on attempts (user_id, boss_ref) where boss_kind is not null;
create index attempts_review_item          on attempts (review_item_id) where review_item_id is not null;
create index review_items_user_due         on review_items (user_id, due_on);
create index mastery_user_band             on mastery (user_id, band);
create index xp_transactions_user_date     on xp_transactions (user_id, local_date);
create index xp_transactions_attempt       on xp_transactions (attempt_id);                        -- on delete set null during account deletion

-- qualifying days for the streak: evaluated attempts only (pending/needs_review rows never qualify).
-- numbers pinned here on purpose: mirror GAMIFICATION_CONFIG.streak, asserted by streak.test.ts
create view v_qualifying_days with (security_invoker = true) as
  select user_id, local_date from attempts where status = 'evaluated' group by user_id, local_date
  having count(*) >= 3 or bool_or(kind in ('explain_why','teach_back','scenario','boss','capstone'));

-- triggers
create function set_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create trigger t_upd before update on profiles                 for each row execute function set_updated_at();
create trigger t_upd before update on notification_preferences for each row execute function set_updated_at();
create trigger t_upd before update on lesson_progress          for each row execute function set_updated_at();
create trigger t_upd before update on lesson_step_states       for each row execute function set_updated_at();
create trigger t_upd before update on mastery                  for each row execute function set_updated_at();
create trigger t_upd before update on review_items             for each row execute function set_updated_at();

-- IANA names only (pg_timezone_names and Node's Intl both track tzdata); the Server Action check is a UX pre-check, this trigger is the invariant
create function validate_time_zone() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'invalid time zone %', new.time_zone using errcode = '22023'; end if;
  return new;
end $$;
create trigger t_tz before insert or update of time_zone on profiles for each row execute function validate_time_zone();

create function handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)                                   -- email may be null: never fail the auth insert
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do update set email = excluded.email;
  insert into public.notification_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert or update of email on auth.users for each row execute function public.handle_new_user();

-- step machine writer: internal only (no API role may execute it); callers pass the user they resolved. Definer + fixed search_path.
create function advance_step(p_user uuid, p_lesson_id text, p_step session_step, p_status step_status, p_payload jsonb default '{}'::jsonb,
  p_duration_ms integer default 0, p_skip_reason skip_reason default null, p_lesson_status lesson_status default null,
  p_flex_action flex_action default null, p_content_hash text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into lesson_step_states as s (user_id, lesson_id, step, status, entered_at, completed_at, duration_ms, skip_reason, payload)
  values (p_user, p_lesson_id, p_step, p_status, case when p_status = 'active' then now() end,
          case when p_status in ('completed','skipped') then now() end, least(greatest(p_duration_ms, 0), 10800000), p_skip_reason, p_payload)
  on conflict (user_id, lesson_id, step) do update set status = excluded.status,
    entered_at = coalesce(s.entered_at, excluded.entered_at), completed_at = coalesce(s.completed_at, excluded.completed_at),
    duration_ms = least(s.duration_ms + excluded.duration_ms, 10800000),
    skip_reason = coalesce(excluded.skip_reason, s.skip_reason), payload = excluded.payload;
  insert into lesson_progress as p (user_id, lesson_id, status, current_step, started_at, completed_at, flex_action_last, content_hash_seen)
  values (p_user, p_lesson_id, coalesce(p_lesson_status, 'in_progress'), p_step, now(),
          case when p_lesson_status in ('completed','completed_early','skipped_with_gap') then now() end, p_flex_action, p_content_hash)
  on conflict (user_id, lesson_id) do update set current_step = excluded.current_step,
    status = coalesce(p_lesson_status, case when p.status = 'not_started' then 'in_progress' else p.status end),
    started_at = coalesce(p.started_at, now()), completed_at = coalesce(p.completed_at, excluded.completed_at),
    flex_action_last = coalesce(p_flex_action, p.flex_action_last),
    content_hash_seen = coalesce(excluded.content_hash_seen, p.content_hash_seen);          -- clears "updated since your last attempt"
end $$;

-- the only step RPC a session may call: read steps only, never lesson_status/flex_action => no lesson completes without an attempt
create function complete_read_step(p_lesson_id text, p_step session_step, p_status step_status, p_payload jsonb default '{}'::jsonb,
  p_duration_ms integer default 0, p_content_hash text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_step not in ('curiosity','problem','caveman','technical','simulation') or p_status not in ('active','completed','skipped') then
    raise exception 'complete_read_step: %/% not allowed', p_step, p_status using errcode = '22023'; end if;
  perform advance_step(v_user, p_lesson_id, p_step, p_status, p_payload, p_duration_ms, null, null, null, p_content_hash);
end $$;

-- one attempt = one transaction. Security definer: the function, not the caller, writes the ledgers (no session holds insert/update on them);
-- user_id comes from auth.uid() and local_date from the profile, any id in the payload is ignored.
create function record_attempt(payload jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid(); v_a jsonb := payload -> 'attempt'; v_local date; v_attempt_id bigint; v_xp integer := 0;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if jsonb_typeof(v_a) is distinct from 'object' then raise exception 'payload.attempt required' using errcode = '22023'; end if;

  -- 0. idempotency: same client nonce => the stored attempt, nothing else runs (a concurrent twin hits unique(user_id, client_nonce))
  select id into v_attempt_id from attempts where user_id = v_user and client_nonce = (v_a ->> 'client_nonce')::uuid;
  if found then return jsonb_build_object('attemptId', v_attempt_id, 'insertedXp', 0, 'duplicate', true); end if;

  -- 1. local date stamped once from the profile's IANA zone; nothing converts at read time
  select (now() at time zone p.time_zone)::date into v_local from profiles p where p.id = v_user;

  -- 2. attempt (user_id and local_date never come from the payload)
  insert into attempts (user_id, local_date, client_nonce, kind, step, lesson_id, concept_id, concept_ids, exercise_id, form_key, question_type,
    dimension, depth, scorer, answer, score, correct, passed, self_confidence, verdict, probe_angle, chain_rung, review_item_id,
    boss_kind, boss_ref, llm_class, llm_evaluation, applied_delta, flags, misconception_ids, status, failure_reason, next_retry_at, duration_ms)
  select v_user, v_local, r.client_nonce, r.kind, r.step, r.lesson_id, r.concept_id, coalesce(r.concept_ids, '{}'), r.exercise_id, r.form_key,
    r.question_type, r.dimension, r.depth, r.scorer, coalesce(r.answer, 'null'::jsonb), r.score, r.correct, r.passed, r.self_confidence,
    coalesce(r.verdict, 'unknown'), r.probe_angle, r.chain_rung, r.review_item_id, r.boss_kind, r.boss_ref, r.llm_class,
    r.llm_evaluation, r.applied_delta, coalesce(r.flags, '{}'), coalesce(r.misconception_ids, '{}'), coalesce(r.status, 'evaluated'),
    r.failure_reason, r.next_retry_at, least(coalesce(r.duration_ms, 0), 10800000)
  from jsonb_populate_record(null::attempts, v_a) r returning id into v_attempt_id;

  -- 3. mastery: whole MasteryState rows replaced, one per concept the attempt evidenced (a boss fans out to N; null/absent = pending or no concept)
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

  -- 4. XP ledger: once-only reasons collide on xp_once_per_ref and are dropped => a retried Server Action is idempotent
  with ev as (select * from jsonb_to_recordset(case when jsonb_typeof(payload -> 'xpEvents') = 'array' then payload -> 'xpEvents' else '[]'::jsonb end)
                as e(reason xp_reason, ref text, base integer, multiplier numeric, amount integer)),
       ins as (insert into xp_transactions (user_id, attempt_id, reason, ref, base, multiplier, amount, local_date)
               select v_user, v_attempt_id, reason, ref, base, coalesce(multiplier, 1.00), amount, v_local from ev
               on conflict do nothing returning 1)
  select count(*) into v_xp from ins;

  -- 5. review items: one live item per (user, concept); due_on defaults to local_date + interval_days (date arithmetic only)
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

  -- 6. step machine, same transaction: a crash after grading never loses the step (llm_usage is not touched here: reserve_llm_call billed the call)
  if jsonb_typeof(payload -> 'stepPatch') = 'object' then
    perform advance_step(v_user, payload #>> '{stepPatch,lesson_id}', (payload #>> '{stepPatch,step}')::session_step,
      (payload #>> '{stepPatch,status}')::step_status, coalesce(payload #> '{stepPatch,payload}', '{}'::jsonb),
      coalesce((payload #>> '{stepPatch,duration_ms}')::integer, 0), (payload #>> '{stepPatch,skip_reason}')::skip_reason,
      (payload #>> '{stepPatch,lesson_status}')::lesson_status, (payload #>> '{stepPatch,flex_action}')::flex_action,
      payload #>> '{stepPatch,content_hash}');
  end if;

  return jsonb_build_object('attemptId', v_attempt_id, 'insertedXp', v_xp, 'duplicate', false);
end $$;

-- quota read: user from auth.uid(), limits from lib/llm/config.ts (SQL holds no tunables). Never null: missing plan key => 22023, no profile => 28000
create function check_llm_quota(p_plan_limits jsonb)
returns table (allowed boolean, remaining_hour int, remaining_day int, retry_after timestamptz)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_plan text; v_h int; v_d int; v_uh int; v_ud int;
begin
  select coalesce(p.plan, 'personal') into v_plan from profiles p where p.id = auth.uid();
  if v_plan is null then raise exception 'no profile' using errcode = '28000'; end if;
  v_h := (p_plan_limits -> v_plan ->> 'hour')::int; v_d := (p_plan_limits -> v_plan ->> 'day')::int;
  if v_h is null or v_d is null then raise exception 'no limits for plan %', v_plan using errcode = '22023'; end if;
  select coalesce(sum(count) filter (where hour_bucket = date_trunc('hour', now())), 0), coalesce(sum(count), 0) into v_uh, v_ud
  from llm_usage where user_id = auth.uid() and hour_bucket > now() - interval '24 hours';
  return query select coalesce(v_uh < v_h and v_ud < v_d, false), v_h - v_uh, v_d - v_ud,
    case when v_uh >= v_h then date_trunc('hour', now()) + interval '1 hour' end;
end $$;

-- quota reserve: check + increment atomically BEFORE the Claude call (per-user transaction lock); at the cap nothing is written.
-- Two concurrent actions cannot both pass, and an action that dies after the call has already been billed.
create function reserve_llm_call(p_plan_limits jsonb)
returns table (allowed boolean, remaining_hour int, remaining_day int, retry_after timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); q record;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext('llm_usage'), hashtext(v_user::text));
  select * into q from check_llm_quota(p_plan_limits);
  if not q.allowed then return query select false, q.remaining_hour, q.remaining_day, q.retry_after; return; end if;
  insert into llm_usage (user_id, hour_bucket, count) values (v_user, date_trunc('hour', now()), 1)
  on conflict (user_id, hour_bucket) do update set count = llm_usage.count + 1;
  return query select true, q.remaining_hour - 1, q.remaining_day - 1, null::timestamptz;
end $$;

-- function grants: default privileges hand execute to public; take it back, then grant exactly what the app calls
revoke execute on function record_attempt(jsonb) from public, anon;                       grant execute on function record_attempt(jsonb) to authenticated;
revoke execute on function complete_read_step(text, session_step, step_status, jsonb, integer, text) from public, anon;
grant  execute on function complete_read_step(text, session_step, step_status, jsonb, integer, text) to authenticated;
revoke execute on function reserve_llm_call(jsonb) from public, anon;                     grant execute on function reserve_llm_call(jsonb) to authenticated;
revoke execute on function check_llm_quota(jsonb) from public, anon;                      grant execute on function check_llm_quota(jsonb) to authenticated;
revoke execute on function advance_step(uuid, text, session_step, step_status, jsonb, integer, skip_reason, lesson_status, flex_action, text)
  from public, anon, authenticated;                                                       -- internal writer: reachable only through the functions above

-- table privileges: Supabase's default grants give authenticated every privilege on new tables; take writes back so PostgREST exposes only the
-- policies below (repeat the revoke in every migration that creates a table). Ledger writes therefore raise 42501, not a silent no-op.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant update (display_name, time_zone, explanation_mode_default) on profiles to authenticated;   -- plan and email: db/admin.ts and the auth trigger only
grant insert, update on notification_preferences to authenticated;

-- RLS: every table; registry select-only; learner tables own-rows-only; ledgers select-only (their writers are the definer functions); no delete policy anywhere
alter table skills enable row level security;   alter table worlds enable row level security;   alter table missions enable row level security;
alter table lessons enable row level security;  alter table concepts enable row level security; alter table lesson_concepts enable row level security;
alter table concept_skills enable row level security;
create policy read on skills for select to authenticated using (true);         create policy read on worlds for select to authenticated using (true);
create policy read on missions for select to authenticated using (true);       create policy read on lessons for select to authenticated using (true);
create policy read on concepts for select to authenticated using (true);       create policy read on lesson_concepts for select to authenticated using (true);
create policy read on concept_skills for select to authenticated using (true);

alter table profiles enable row level security;
create policy profiles_select on profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update on profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- columns limited by the grant above; insert: trigger only (security definer)

alter table notification_preferences enable row level security;
create policy np_select on notification_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy np_insert on notification_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy np_update on notification_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table notification_log enable row level security;
create policy nl_select on notification_log for select to authenticated using ((select auth.uid()) = user_id);   -- writes: db/admin.ts only

alter table llm_usage enable row level security;
create policy lu_select on llm_usage for select to authenticated using ((select auth.uid()) = user_id);          -- writes: reserve_llm_call only
alter table lesson_progress enable row level security;
create policy lp_select on lesson_progress for select to authenticated using ((select auth.uid()) = user_id);    -- writes: advance_step only
alter table lesson_step_states enable row level security;
create policy ls_select on lesson_step_states for select to authenticated using ((select auth.uid()) = user_id); -- writes: advance_step only
alter table mastery enable row level security;
create policy m_select on mastery for select to authenticated using ((select auth.uid()) = user_id);             -- writes: record_attempt / resolve_pending_evaluation
alter table review_items enable row level security;
create policy ri_select on review_items for select to authenticated using ((select auth.uid()) = user_id);       -- writes: record_attempt / resolve_pending_evaluation
alter table attempts enable row level security;
create policy a_select on attempts for select to authenticated using ((select auth.uid()) = user_id);            -- insert: record_attempt; update: resolve_pending_evaluation
alter table xp_transactions enable row level security;
create policy xp_select on xp_transactions for select to authenticated using ((select auth.uid()) = user_id);    -- append-only via record_attempt; manual_adjustment: db/admin.ts scripts
