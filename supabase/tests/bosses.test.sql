-- supabase/tests/bosses.test.sql: boss / capstone attempts. SQL stores llm_evaluation verbatim (submitAttempt merges
-- `defeated` = isDefeated(rubric, kind, config) before the RPC) and every reader takes llm_evaluation ->> 'defeated'; nothing recomputes it.
--
-- The three rubrics below mirror tests/fixtures/rubrics.json (ids mission / weekly / capstone), the file
-- lib/gamification/bosses.test.ts derives `defeated` from. Expected: mission -> true (overall 70 >= 70, every dimension >= 40),
-- weekly -> false (tradeOffs 45 < 50), capstone -> true (11 of 12 dimensions >= 60, overall 76 >= 75).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local');
insert into worlds (id, ordinal, title, skill) values ('w1-platform', 1, 'The Salesforce Platform', 'platform');
insert into missions (id, world_id, ordinal, title, boss_lesson_id) values ('w1-m1-basics', 'w1-platform', 1, 'Basics', 'boss-w1-m1-basics');
insert into lessons (id, mission_id, day, kind, visibility, ordinal, title, release, api_version, content_hash) values
  ('boss-w1-m1-basics', 'w1-m1-basics', 7, 'boss', 'core', 7, 'Boss: the recursive trigger', 'summer-26', '67.0', 'h1'),
  ('capstone', 'w1-m1-basics', 180, 'capstone', 'core', 180, 'Capstone', 'summer-26', '67.0', 'h2');
insert into concepts (id, world_id, title, skill) values ('metadata', 'w1-platform', 'Metadata', 'platform'),
  ('transaction-model', 'w1-platform', 'Transaction model', 'platform'), ('savepoints', 'w1-platform', 'Savepoints', 'platform');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- fixture "mission": defeated = true
select is(((select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000001","kind":"boss","boss_kind":"mission","boss_ref":"w1-m1-basics",
  "lesson_id":"boss-w1-m1-basics","concept_ids":["metadata","transaction-model","savepoints"],"form_key":"boss-w1-m1-basics","question_type":"boss",
  "depth":7,"scorer":"llm","llm_class":"boss","answer":"The after-update trigger re-enters itself through the workflow field update.",
  "score":70,"passed":true,"duration_ms":900000,
  "llm_evaluation":{"suspect":80,"why":75,"dataNeeded":70,"whatToInspect":65,"solution":72,"tradeOffs":58,"overall":70,"misconceptions":[],
    "strengths":["Named the trigger recursion as the suspect"],"gaps":["Did not weigh the async alternative"],
    "feedback":"Solid diagnosis; the trade-off section was thin.","defeated":true}},
  "masteryPatches":[
    {"concept_id":"metadata","recall":60,"understanding":60,"application":60,"debugging":60,"architecture":60,"teach_back":0,"overall":60,"band":"developing","evidence_count":1,"state":{}},
    {"concept_id":"transaction-model","recall":55,"understanding":55,"application":55,"debugging":55,"architecture":55,"teach_back":0,"overall":55,"band":"familiar","evidence_count":1,"state":{}},
    {"concept_id":"savepoints","recall":60,"understanding":60,"application":60,"debugging":60,"architecture":60,"teach_back":0,"overall":60,"band":"developing","evidence_count":1,"state":{}}],
  "xpEvents":[{"reason":"mission_boss_attempted","ref":"w1-m1-basics","base":100,"multiplier":1,"amount":100},
              {"reason":"mission_boss_defeated","ref":"w1-m1-basics","base":300,"multiplier":1,"amount":300}],
  "reviewPatches":null,"stepPatch":null,"llmCalls":1}'::jsonb)) ->> 'insertedXp')::int, 2,
  'mission boss: attempt + defeat XP written once with the attempt');

-- fixture "weekly": defeated = false; weekly bosses have no lesson row
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000002","kind":"boss","boss_kind":"weekly","boss_ref":"weekly-w02",
  "concept_ids":["metadata","transaction-model"],"form_key":"weekly-w02","question_type":"boss","depth":7,"scorer":"llm","llm_class":"boss",
  "answer":"Queueable chain exceeds the async limit.","score":77,"passed":false,
  "llm_evaluation":{"suspect":90,"why":85,"dataNeeded":80,"whatToInspect":78,"solution":82,"tradeOffs":45,"overall":77,
    "misconceptions":[{"id":"async-is-free","summary":"Treated Queueable as having no limits of its own"}],
    "strengths":["Correctly asked for the debug log with the limit usage lines"],"gaps":["No discussion of what the fix costs at 10M rows"],
    "feedback":"Strong diagnosis, but the trade-off dimension fails the weekly bar.","defeated":false}},
  "xpEvents":[{"reason":"weekly_boss_attempted","ref":"weekly-w02","base":100,"multiplier":1,"amount":100}]}'::jsonb) $$,
  'weekly boss recorded with lesson_id null');

-- fixture "capstone": defeated = true
select lives_ok($$ select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000003","kind":"capstone","boss_kind":"capstone","boss_ref":"capstone",
  "lesson_id":"capstone","concept_ids":["metadata","transaction-model","savepoints"],"form_key":"capstone","question_type":"capstone","depth":8,
  "scorer":"llm","llm_class":"capstone","answer":"Design document...","score":76,"passed":true,
  "llm_evaluation":{"scores":{"platformKnowledge":88,"dataArchitecture":84,"security":62,"apex":79,"automation":71,"integration":80,"scalability":86,
    "performance":75,"reliability":66,"observability":52,"tradeOffReasoning":90,"communication":82},"overall":76,"misconceptions":[],
    "strengths":["Scalable data model with skew called out"],"gaps":["Observability plan is an afterthought"],
    "feedback":"Passes on eleven of twelve dimensions.","defeated":true}},
  "xpEvents":[{"reason":"capstone_attempted","ref":"capstone","base":500,"multiplier":1,"amount":500},
              {"reason":"capstone_passed","ref":"capstone","base":2000,"multiplier":1,"amount":2000}]}'::jsonb) $$,
  'capstone recorded');

select is((select (llm_evaluation ->> 'defeated')::boolean from attempts where boss_ref = 'w1-m1-basics'), true, 'mission fixture: defeated = true');
select is((select (llm_evaluation ->> 'defeated')::boolean from attempts where boss_ref = 'weekly-w02'), false, 'weekly fixture: defeated = false');
select is((select (llm_evaluation ->> 'defeated')::boolean from attempts where boss_ref = 'capstone'), true, 'capstone fixture: defeated = true');
select is((select llm_evaluation -> 'tradeOffs' from attempts where boss_ref = 'weekly-w02'), '45'::jsonb, 'the rubric is stored verbatim');
select is((select count(*)::int from attempts where boss_kind is not null and (llm_evaluation ->> 'defeated')::boolean), 2,
  'bosses_defeated derives from llm_evaluation only');

-- retries: once-only XP refs are dropped, a repeated nonce returns the stored attempt
select is(((select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000004","kind":"boss","boss_kind":"mission","boss_ref":"w1-m1-basics",
  "lesson_id":"boss-w1-m1-basics","concept_ids":["metadata"],"form_key":"boss-w1-m1-basics","question_type":"boss","depth":7,"scorer":"llm","llm_class":"boss",
  "answer":"second try","score":74,"passed":true,"llm_evaluation":{"suspect":80,"why":75,"dataNeeded":70,"whatToInspect":70,"solution":75,"tradeOffs":74,"overall":74,"defeated":true}},
  "xpEvents":[{"reason":"mission_boss_attempted","ref":"w1-m1-basics","base":100,"multiplier":1,"amount":100},
              {"reason":"mission_boss_defeated","ref":"w1-m1-basics","base":300,"multiplier":1,"amount":300}]}'::jsonb)) ->> 'insertedXp')::int, 0,
  'a second defeat of the same boss earns no XP again (xp_once_per_ref)');
select is((select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000001","kind":"boss","boss_kind":"mission","boss_ref":"w1-m1-basics",
  "concept_ids":["metadata"],"form_key":"boss-w1-m1-basics","question_type":"boss","depth":7,"scorer":"llm","answer":"x"}}'::jsonb) ->> 'duplicate'), 'true',
  'a repeated client_nonce returns the stored attempt without writing');

-- shape constraints
select throws_ok($$ select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000005","kind":"boss","boss_kind":"weekly","boss_ref":"weekly-w03",
  "lesson_id":"boss-w1-m1-basics","concept_ids":["metadata"],"form_key":"weekly-w03","question_type":"boss","depth":7,"scorer":"llm","answer":"x"}}'::jsonb) $$,
  '23514', null, 'a weekly boss never references a lesson row');
select throws_ok($$ select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000006","kind":"boss","boss_kind":"mission","boss_ref":"w1-m1-basics",
  "form_key":"boss-w1-m1-basics","question_type":"boss","depth":7,"scorer":"llm","answer":"x"}}'::jsonb) $$,
  '23514', null, 'a boss attempt must list the concepts it evidenced');
select throws_ok($$ select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000007","kind":"boss","boss_kind":"mission","boss_ref":"w1-m1-basics",
  "concept_ids":["metadata"],"dimension":"debugging","form_key":"boss-w1-m1-basics","question_type":"boss","depth":7,"scorer":"llm","answer":"x"}}'::jsonb) $$,
  '23514', null, 'a boss attempt carries no single dimension (the rubric maps to four)');
select throws_ok($$ select record_attempt('{"attempt":{"client_nonce":"aaaaaaaa-0000-0000-0000-000000000008","kind":"question","boss_kind":"mission","boss_ref":"w1-m1-basics",
  "concept_id":"metadata","form_key":"q","question_type":"mcq","dimension":"recall","depth":1,"scorer":"deterministic","answer":1}}'::jsonb) $$,
  '23514', null, 'boss_kind is set exactly when kind is boss/capstone');
select * from finish();
rollback;
