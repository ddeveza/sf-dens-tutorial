-- supabase/tests/pending_evaluation.test.sql: resolve_pending_evaluation (0002) applies an LLM grade to an existing
-- pending row. Owner gate: auth.uid() null (service_role cron) or the row owner; anything else 42501. Steps 3-6 of
-- record_attempt run with the row owner, so mastery / XP / review / step rows land exactly as they would have at grading time.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
                                          ('00000000-0000-0000-0000-00000000000b', 'b@test.local');
insert into worlds (id, ordinal, title, skill) values ('w1-platform', 1, 'The Salesforce Platform', 'platform');
insert into missions (id, world_id, ordinal, title) values ('w1-m1-metadata', 'w1-platform', 1, 'Metadata');
insert into lessons (id, mission_id, day, kind, visibility, ordinal, title, release, api_version, content_hash)
  values ('d001-what-is-metadata', 'w1-m1-metadata', 1, 'lesson', 'core', 1, 'What is metadata', 'summer-26', '67.0', 'h');
insert into concepts (id, world_id, title, skill) values ('metadata', 'w1-platform', 'Metadata', 'platform');

-- A submits an explain-why probe whose grading failed (truncated): stored pending, zero mastery, step parked
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"a0000000-0000-0000-0000-000000000001","kind":"explain_why","step":"assessment",
  "lesson_id":"d001-what-is-metadata","concept_id":"metadata","exercise_id":"d001-what-is-metadata/p1","form_key":"d001-what-is-metadata/p1",
  "question_type":"explain_why","dimension":"understanding","depth":3,"scorer":"llm","llm_class":"probe","answer":"Because metadata describes the org.",
  "status":"pending_evaluation","failure_reason":"truncated","retry_count":0,"next_retry_at":"2026-09-07T10:00:00Z"},
  "masteryPatches":null,"xpEvents":null,"reviewPatches":null,
  "stepPatch":{"lesson_id":"d001-what-is-metadata","step":"assessment","status":"pending_evaluation","content_hash":"h"},"llmCalls":1}'::jsonb) $$,
  'a pending attempt is recorded without mastery or XP');
select is((select count(*)::int from mastery), 0, 'no mastery row yet');
select is((select status::text from lesson_step_states where step = 'assessment'), 'pending_evaluation', 'the step is parked, not completed');

-- B may not drain A's row
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select resolve_pending_evaluation(currval(pg_get_serial_sequence('attempts', 'id')), '{"attempt":{"status":"evaluated","score":90}}'::jsonb) $$,
  '42501', null, 'another learner cannot resolve my pending attempt');

-- A drains their own row with a successful grade
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select resolve_pending_evaluation((select id from attempts where client_nonce = 'a0000000-0000-0000-0000-000000000001'), '{}'::jsonb) $$,
  '22023', null, 'payload.attempt is required');
select is(((select resolve_pending_evaluation((select id from attempts where client_nonce = 'a0000000-0000-0000-0000-000000000001'), '{
  "attempt":{"status":"evaluated","score":85,"correct":true,"passed":true,"verdict":"calibrated","applied_delta":12,"flags":[],
    "misconception_ids":["metadata-vs-data"],"retry_count":1,
    "llm_evaluation":{"correctness":85,"understanding":80,"application":60,"architecture":40,"confidence":"calibrated","masteryDelta":12,"misconceptions":[],"nextAction":"continue"}},
  "masteryPatches":[{"concept_id":"metadata","recall":40,"understanding":52,"application":0,"debugging":0,"architecture":0,"teach_back":0,
    "overall":46,"band":"familiar","cap_reason":"no_application_or_debugging","evidence_count":1,"state":{}}],
  "xpEvents":[{"reason":"explain_why_passed","ref":null,"base":25,"multiplier":1.5,"amount":38}],
  "reviewPatches":[{"concept_id":"metadata","dimension":"understanding","depth":3,"question_type":"explain_why","angle":"what_if","interval_days":3,"reason":"scheduled"}],
  "stepPatch":{"lesson_id":"d001-what-is-metadata","step":"assessment","status":"completed"}}'::jsonb)) ->> 'insertedXp')::int, 1,
  'the owner resolves the row and the deferred XP is written');
select results_eq($$ select status::text, score, correct, verdict::text, applied_delta, misconception_ids, retry_count, next_retry_at is null, failure_reason is null
                     from attempts where client_nonce = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('evaluated', 85::smallint, true, 'calibrated', 12::smallint, '{metadata-vs-data}'::text[], 1::smallint, true, true) $$,
  'evaluation columns updated; retry bookkeeping cleared');
select results_eq($$ select understanding, band::text, cap_reason::text from mastery $$,
  $$ values (52::smallint, 'familiar', 'no_application_or_debugging') $$, 'mastery row replaced with the graded state');
select results_eq($$ select amount, local_date = (select local_date from attempts where client_nonce = 'a0000000-0000-0000-0000-000000000001') from xp_transactions $$,
  $$ values (38, true) $$, 'XP dated with the attempt''s own local day');
select is((select due_on - (select local_date from attempts where client_nonce = 'a0000000-0000-0000-0000-000000000001') from review_items), 3,
  'review due_on defaults to local_date + interval_days');
select is((select status::text from lesson_step_states where step = 'assessment'), 'completed', 'the parked step completed in the same transaction');
select throws_ok($$ select resolve_pending_evaluation((select id from attempts where client_nonce = 'a0000000-0000-0000-0000-000000000001'), '{"attempt":{"status":"evaluated"}}'::jsonb) $$,
  '42501', null, 'an evaluated row is no longer resolvable by a session');

-- the cron drain (service_role, no sub claim) gives up on a row after the retry cap: needs_review, still zero mastery change
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"a0000000-0000-0000-0000-000000000002","kind":"teach_back","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","form_key":"d001-what-is-metadata/tb1","question_type":"teach_back","dimension":"teach_back","depth":4,"scorer":"llm","llm_class":"probe",
  "answer":"...","status":"pending_evaluation","failure_reason":"timeout","retry_count":2,"next_retry_at":"2026-09-07T10:00:00Z"}}'::jsonb) $$,
  'a second pending attempt');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok($$ select resolve_pending_evaluation(-1, '{"attempt":{"status":"needs_review"}}'::jsonb) $$, '22023', null,
  'service_role: an unknown or non-pending id is a payload error, not a permission error');
select results_eq($$ select (r ->> 'status'), (r ->> 'insertedXp')::int from resolve_pending_evaluation(
    (select id from attempts where client_nonce = 'a0000000-0000-0000-0000-000000000002'),
    '{"attempt":{"status":"needs_review","retry_count":3,"failure_reason":"retry cap reached"}}'::jsonb) r $$,
  $$ values ('needs_review', 0) $$, 'service_role marks the row needs_review with no XP');
select * from finish();
rollback;
