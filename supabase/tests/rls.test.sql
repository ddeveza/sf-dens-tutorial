-- supabase/tests/rls.test.sql: own-rows-only policies on the learner ledgers, the column grant on profiles,
-- and the IANA time-zone trigger. Errcodes: 42501 grant/RLS, 22023 invalid zone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
                                          ('00000000-0000-0000-0000-00000000000b', 'b@test.local');
insert into worlds (id, ordinal, title, skill) values ('w1-platform', 1, 'The Salesforce Platform', 'platform');
insert into missions (id, world_id, ordinal, title) values ('w1-m1-metadata', 'w1-platform', 1, 'Metadata');
insert into lessons (id, mission_id, day, kind, visibility, ordinal, title, release, api_version, content_hash)
  values ('d001-what-is-metadata', 'w1-m1-metadata', 1, 'lesson', 'core', 1, 'What is metadata', 'summer-26', '67.0', 'h');
insert into concepts (id, world_id, title, skill) values ('metadata', 'w1-platform', 'Metadata', 'platform');

-- user B owns one attempt, one mastery row and one XP row
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"b1b1b1b1-0000-0000-0000-000000000001","kind":"question","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","exercise_id":"d001-what-is-metadata/q1","form_key":"d001-what-is-metadata/q1","question_type":"mcq","dimension":"recall",
  "depth":1,"scorer":"deterministic","answer":2,"score":100,"correct":true},
  "masteryPatches":[{"concept_id":"metadata","recall":50,"understanding":0,"application":0,"debugging":0,"architecture":0,"teach_back":0,
    "overall":50,"band":"familiar","cap_reason":"recall_only","evidence_count":1,"state":{}}],
  "xpEvents":[{"reason":"answer_correct","ref":"d001-what-is-metadata/q1","base":10,"multiplier":1,"amount":10}]}'::jsonb) $$,
  'user B records an attempt with mastery and xp');
select is((select count(*)::int from attempts), 1, 'B sees their own attempt');

-- the same session now carries user A''s claims: B''s rows vanish
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is_empty($$ select * from attempts $$, 'A cannot see B''s attempts');
select is_empty($$ select * from mastery $$, 'A cannot see B''s mastery');
select is_empty($$ select * from xp_transactions $$, 'A cannot see B''s xp');
select throws_ok($$ update profiles set plan = 'team' $$, '42501', null, 'plan is admin-owned: the column grant excludes it');
select lives_ok($$ update profiles set time_zone = 'Europe/Lisbon' $$, 'a learner may change their own time zone');
select is((select time_zone from profiles), 'Europe/Lisbon', 'the update reached my row (RLS scopes the statement to my id)');
select throws_ok($$ update profiles set time_zone = 'Mars/Olympus_Mons' $$, '22023', null, 'non-IANA zones are rejected by the trigger');

reset role;
select is((select time_zone from profiles where id = '00000000-0000-0000-0000-00000000000b'), 'UTC', 'B''s zone was untouched by A''s update');
select * from finish();
rollback;
