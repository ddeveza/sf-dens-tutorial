-- supabase/tests/record_attempt.test.sql (ARCHITECTURE.md Data Model §5, verbatim): one attempt = one transaction,
-- written by a security definer function for a session that holds select-only policies on every ledger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
                                          ('00000000-0000-0000-0000-00000000000b', 'b@test.local');   -- fires handle_new_user
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000c');                        -- no email (OAuth without scope): trigger must not fail
insert into worlds (id, ordinal, title, skill) values ('w1-platform', 1, 'The Salesforce Platform', 'platform');
insert into missions (id, world_id, ordinal, title) values ('w1-m1-metadata', 'w1-platform', 1, 'Metadata');
insert into lessons (id, mission_id, day, kind, visibility, ordinal, title, release, api_version, content_hash)
  values ('d001-what-is-metadata', 'w1-m1-metadata', 1, 'lesson', 'core', 1, 'What is metadata', 'summer-26', '67.0', 'h');
insert into concepts (id, world_id, title, skill) values ('metadata', 'w1-platform', 'Metadata', 'platform'),
  ('transaction-model', 'w1-platform', 'Transaction model', 'platform'), ('savepoints', 'w1-platform', 'Savepoints', 'platform');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from profiles), 1, 'trigger created my profile (and the email-less one) and RLS hides the others');
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"11111111-1111-1111-1111-111111111111","kind":"question","lesson_id":"d001-what-is-metadata",
  "concept_id":"metadata","exercise_id":"d001-what-is-metadata/q1","form_key":"d001-what-is-metadata/q1","question_type":"mcq","dimension":"recall",
  "depth":1,"scorer":"deterministic","answer":2,"score":100,"correct":true},
  "masteryPatches":[{"concept_id":"metadata","recall":50,"understanding":0,"application":0,"debugging":0,"architecture":0,"teach_back":0,
    "overall":50,"band":"familiar","cap_reason":"recall_only","evidence_count":1,"state":{}}],
  "xpEvents":[{"reason":"answer_correct","ref":"d001-what-is-metadata/q1","base":10,"multiplier":1,"amount":10}],
  "reviewPatches":null,"stepPatch":{"lesson_id":"d001-what-is-metadata","step":"assessment","status":"completed","content_hash":"h"},"llmCalls":0}'::jsonb) $$,
  'definer function records attempt + mastery + xp + step atomically for a session with select-only policies');
select is((select amount from xp_transactions), 10, 'xp row written in the same transaction');
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"33333333-3333-3333-3333-333333333333","kind":"question","concept_id":"metadata",
  "form_key":"x","question_type":"mcq","dimension":"recall","depth":1,"scorer":"deterministic","answer":1,"score":0,"correct":false},
  "xpEvents":null}'::jsonb) $$, 'json null xpEvents is treated as no events');
select throws_ok($$ select record_attempt('{"attempt":{"client_nonce":"22222222-2222-2222-2222-222222222222","kind":"question","concept_id":"metadata",
  "form_key":"x","question_type":"mcq","dimension":"recall","depth":1,"scorer":"deterministic","answer":1,"score":101}}'::jsonb) $$,
  '23514', null, 'score 101 violates the 0-100 check');
select throws_ok($$ select record_attempt('{"attempt":{"client_nonce":"44444444-4444-4444-4444-444444444444","kind":"boss","boss_kind":"mission",
  "boss_ref":"boss-w1-m1-metadata","concept_ids":["metadata","transaction-model","savepoints"],"form_key":"boss-w1-m1-metadata","question_type":"boss",
  "depth":7,"scorer":"llm","llm_class":"boss","answer":"...","score":72,"llm_evaluation":{"overall":72,"defeated":true}},
  "masteryPatches":[
   {"concept_id":"metadata","recall":60,"understanding":60,"application":60,"debugging":60,"architecture":60,"teach_back":0,"overall":60,"band":"developing"},
   {"concept_id":"transaction-model","recall":55,"understanding":55,"application":55,"debugging":55,"architecture":55,"teach_back":0,"overall":55,"band":"familiar"},
   {"concept_id":"savepoints","recall":60,"understanding":60,"application":60,"debugging":60,"architecture":60,"teach_back":0,"overall":101,"band":"strong"}]}'::jsonb) $$,
  '23514', null, 'a boss attempt touching three concepts rolls back as a unit');
select is((select count(*)::int from mastery), 1, 'the failing calls rolled back their attempt and mastery rows');
select throws_ok($$ update llm_usage set count = 0 $$, '42501', null, 'quota counter is not writable by a session');
select throws_ok($$ insert into xp_transactions (user_id, reason, ref, base, amount, local_date)
  values ('00000000-0000-0000-0000-00000000000a', 'capstone_passed', 'capstone', 1000, 1000, current_date) $$, '42501', null, 'XP cannot be forged');
select throws_ok($$ update attempts set llm_evaluation = '{"defeated":true}'::jsonb $$, '42501', null, 'evaluated rows are immutable to a session');
select throws_ok($$ insert into mastery (user_id, concept_id) values ('00000000-0000-0000-0000-00000000000a', 'metadata') $$,
  '42501', null, 'mastery is written only by record_attempt, even for my own user_id');
select throws_ok($$ select complete_read_step('d001-what-is-metadata', 'assessment', 'completed') $$, '22023', null,
  'evaluated steps cannot be completed without an attempt');
select * from finish();
rollback;
