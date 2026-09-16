-- supabase/tests/steps.test.sql: complete_read_step is the only step RPC a session may call (read steps only,
-- LEARNING_CONFIG.readSteps = curiosity, problem, caveman, technical, simulation; statuses active/completed/skipped);
-- advance_step is internal. Errcodes: 22023 disallowed step/status, 42501 grant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local');
insert into worlds (id, ordinal, title, skill) values ('w1-platform', 1, 'The Salesforce Platform', 'platform');
insert into missions (id, world_id, ordinal, title) values ('w1-m1-metadata', 'w1-platform', 1, 'Metadata');
insert into lessons (id, mission_id, day, kind, visibility, ordinal, title, release, api_version, content_hash)
  values ('d001-what-is-metadata', 'w1-m1-metadata', 1, 'lesson', 'core', 1, 'What is metadata', 'summer-26', '67.0', 'h');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$ select complete_read_step('d001-what-is-metadata', 'caveman', 'completed', '{"step":"caveman","toggles":2}'::jsonb, 120000, 'h') $$,
  'a read step completes through the RPC');
select results_eq($$ select status::text, current_step::text, content_hash_seen from lesson_progress $$,
  $$ values ('in_progress', 'caveman', 'h') $$, 'lesson_progress is in_progress with content_hash_seen = h (never completed by a read step)');
select results_eq($$ select status::text, duration_ms, payload from lesson_step_states where step = 'caveman' $$,
  $$ values ('completed', 120000, '{"step":"caveman","toggles":2}'::jsonb) $$, 'step row completed with its duration and payload');

select throws_ok($$ select complete_read_step('d001-what-is-metadata', 'assessment', 'completed') $$, '22023', null,
  'evaluated steps are not read steps');
select throws_ok($$ select complete_read_step('d001-what-is-metadata', 'caveman', 'locked') $$, '22023', null,
  'only active / completed / skipped may be requested');
select throws_ok($$ select advance_step('00000000-0000-0000-0000-00000000000a', 'd001-what-is-metadata', 'assessment', 'completed') $$, '42501', null,
  'advance_step is internal: execute revoked from authenticated');
select throws_ok($$ insert into lesson_step_states (user_id, lesson_id, step) values ('00000000-0000-0000-0000-00000000000a', 'd001-what-is-metadata', 'teach_back') $$,
  '42501', null, 'step rows are not writable by a session');
select throws_ok($$ update lesson_progress set status = 'completed' $$, '42501', null, 'lesson completion is not writable by a session');

select lives_ok($$ select complete_read_step('d001-what-is-metadata', 'caveman', 'completed', '{}'::jsonb, 10800000, null) $$,
  'a second completion of the same step upserts');
select is((select duration_ms from lesson_step_states where step = 'caveman'), 10800000, 'accumulated duration is clamped to 3h');
select is((select content_hash_seen from lesson_progress), 'h', 'a null content_hash keeps the hash already seen');
select * from finish();
rollback;
