-- supabase/tests/streak.test.sql: v_qualifying_days is the streak's only input. Its numbers mirror
-- GAMIFICATION_CONFIG.streak (minAttempts = 3, freeTextKinds = explain_why, teach_back, scenario, boss, capstone);
-- lib/gamification/streak.test.ts asserts the same values. Pending / needs_review rows never qualify.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
                                          ('00000000-0000-0000-0000-00000000000b', 'b@test.local'),
                                          ('00000000-0000-0000-0000-00000000000c', 'c@test.local');
insert into worlds (id, ordinal, title, skill) values ('w1-platform', 1, 'The Salesforce Platform', 'platform');
insert into missions (id, world_id, ordinal, title) values ('w1-m1-metadata', 'w1-platform', 1, 'Metadata');
insert into lessons (id, mission_id, day, kind, visibility, ordinal, title, release, api_version, content_hash)
  values ('d001-what-is-metadata', 'w1-m1-metadata', 1, 'lesson', 'core', 1, 'What is metadata', 'summer-26', '67.0', 'h');
insert into concepts (id, world_id, title, skill) values ('metadata', 'w1-platform', 'Metadata', 'platform');

-- A: three evaluated MCQs on one local day
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"a0000000-0000-0000-0000-000000000001","kind":"question","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","form_key":"d001-what-is-metadata/q1","question_type":"mcq","dimension":"recall","depth":1,"scorer":"deterministic",
  "answer":2,"score":100,"correct":true}}'::jsonb) $$, 'A: evaluated mcq 1');
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"a0000000-0000-0000-0000-000000000002","kind":"question","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","form_key":"d001-what-is-metadata/q2","question_type":"mcq","dimension":"recall","depth":1,"scorer":"deterministic",
  "answer":1,"score":0,"correct":false}}'::jsonb) $$, 'A: evaluated mcq 2');
select is_empty($$ select * from v_qualifying_days $$, 'two evaluated MCQs do not qualify the day (minAttempts = 3)');
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"a0000000-0000-0000-0000-000000000003","kind":"question","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","form_key":"d001-what-is-metadata/q3","question_type":"true_false","dimension":"recall","depth":1,"scorer":"deterministic",
  "answer":true,"score":100,"correct":true}}'::jsonb) $$, 'A: evaluated mcq 3');
select results_eq($$ select user_id, local_date from v_qualifying_days $$,
  $$ select '00000000-0000-0000-0000-00000000000a'::uuid, (now() at time zone 'UTC')::date $$,
  'three evaluated MCQs qualify the local day (profiles.time_zone = UTC)');

-- B: a single evaluated teach-back
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"b0000000-0000-0000-0000-000000000001","kind":"teach_back","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","form_key":"d001-what-is-metadata/tb1","question_type":"teach_back","dimension":"teach_back","depth":4,"scorer":"llm",
  "llm_class":"probe","answer":"Metadata is the description of the org, not the records in it.","score":82,"correct":true,"passed":true,
  "status":"evaluated","llm_evaluation":{"correctness":85,"understanding":80}}}'::jsonb) $$, 'B: one evaluated teach-back');
select results_eq($$ select user_id from v_qualifying_days $$, $$ values ('00000000-0000-0000-0000-00000000000b'::uuid) $$,
  'one evaluated free-text attempt qualifies; security_invoker hides A''s day from B');

-- C: three free-text rows still pending evaluation
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"c0000000-0000-0000-0000-000000000001","kind":"explain_why","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","form_key":"d001-what-is-metadata/p1","question_type":"explain_why","dimension":"understanding","depth":3,"scorer":"llm",
  "llm_class":"probe","answer":"because","status":"pending_evaluation","failure_reason":"truncated","next_retry_at":"2026-09-07T10:00:00Z"}}'::jsonb) $$,
  'C: pending 1');
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"c0000000-0000-0000-0000-000000000002","kind":"explain_why","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","form_key":"d001-what-is-metadata/p2","question_type":"explain_why","dimension":"understanding","depth":3,"scorer":"llm",
  "llm_class":"probe","answer":"because","status":"pending_evaluation","failure_reason":"parse_null","next_retry_at":"2026-09-07T10:00:00Z"}}'::jsonb) $$,
  'C: pending 2');
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"c0000000-0000-0000-0000-000000000003","kind":"explain_why","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","form_key":"d001-what-is-metadata/p3","question_type":"explain_why","dimension":"understanding","depth":3,"scorer":"llm",
  "llm_class":"probe","answer":"because","status":"pending_evaluation","failure_reason":"timeout","next_retry_at":"2026-09-07T10:00:00Z"}}'::jsonb) $$,
  'C: pending 3');
select is_empty($$ select * from v_qualifying_days $$, 'three pending_evaluation rows never qualify, even free-text ones');

reset role;
select is((select count(*)::int from v_qualifying_days), 2, 'as admin: A and B qualify, C does not');
select * from finish();
rollback;
