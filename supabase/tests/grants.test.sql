-- supabase/tests/grants.test.sql: execute and table privileges are the boundary PostgREST enforces before RLS
-- (42501, never a silent no-op). Covers the 0001 revokes/grants, the 0002 grants, the role timeout and the cron schedules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into worlds (id, ordinal, title, skill) values ('w1-platform', 1, 'The Salesforce Platform', 'platform');

set local role anon;
select throws_ok($$ select record_attempt('{"attempt":{}}'::jsonb) $$, '42501', null, 'anon cannot execute record_attempt');
select throws_ok($$ select * from reserve_llm_call('{}'::jsonb) $$, '42501', null, 'anon cannot execute reserve_llm_call');
select throws_ok($$ select * from check_llm_quota('{}'::jsonb) $$, '42501', null, 'anon cannot execute check_llm_quota');
select throws_ok($$ select complete_read_step('x', 'caveman', 'completed') $$, '42501', null, 'anon cannot execute complete_read_step');
select throws_ok($$ select resolve_pending_evaluation(1, '{}'::jsonb) $$, '42501', null, 'anon cannot execute resolve_pending_evaluation');
select is_empty($$ select * from worlds $$, 'anon has no registry policy: zero rows, no error');
reset role;

set local role authenticated;   -- a session role with no JWT claims
select throws_ok($$ select record_attempt('{"attempt":{}}'::jsonb) $$, '28000', null,
  'authenticated without claims: unauthenticated (28000), not permission denied');
select throws_ok($$ select advance_step('00000000-0000-0000-0000-00000000000a', 'x', 'assessment', 'completed') $$, '42501', null,
  'advance_step is internal: reachable only through record_attempt / complete_read_step / resolve_pending_evaluation');
select is((select count(*)::int from worlds), 1, 'authenticated reads the registry');
reset role;

-- privilege catalog
select ok(has_function_privilege('authenticated', 'public.record_attempt(jsonb)', 'execute'), 'authenticated: record_attempt');
select ok(has_function_privilege('authenticated', 'public.complete_read_step(text, session_step, step_status, jsonb, integer, text)', 'execute'),
  'authenticated: complete_read_step');
select ok(has_function_privilege('authenticated', 'public.reserve_llm_call(jsonb)', 'execute')
      and has_function_privilege('authenticated', 'public.check_llm_quota(jsonb)', 'execute'), 'authenticated: reserve_llm_call + check_llm_quota');
select ok(has_function_privilege('authenticated', 'public.resolve_pending_evaluation(bigint, jsonb)', 'execute')
      and has_function_privilege('service_role', 'public.resolve_pending_evaluation(bigint, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.resolve_pending_evaluation(bigint, jsonb)', 'execute'),
  'resolve_pending_evaluation: authenticated + service_role, never anon');
select ok(not has_function_privilege('authenticated',
  'public.advance_step(uuid, text, session_step, step_status, jsonb, integer, skip_reason, lesson_status, flex_action, text)', 'execute')
      and not has_function_privilege('anon',
  'public.advance_step(uuid, text, session_step, step_status, jsonb, integer, skip_reason, lesson_status, flex_action, text)', 'execute'),
  'no API role executes advance_step');
select ok(not has_table_privilege('authenticated', 'public.xp_transactions', 'insert')
      and not has_table_privilege('authenticated', 'public.mastery', 'update')
      and not has_table_privilege('authenticated', 'public.attempts', 'delete')
      and not has_table_privilege('authenticated', 'public.llm_usage', 'update')
      and not has_table_privilege('authenticated', 'public.notification_log', 'insert')
      and has_table_privilege('authenticated', 'public.attempts', 'select'), 'ledgers: select-only for sessions');
select ok(has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update')
      and has_column_privilege('authenticated', 'public.profiles', 'time_zone', 'update')
      and has_column_privilege('authenticated', 'public.profiles', 'explanation_mode_default', 'update')
      and not has_column_privilege('authenticated', 'public.profiles', 'plan', 'update')
      and not has_column_privilege('authenticated', 'public.profiles', 'email', 'update')
      and not has_table_privilege('authenticated', 'public.profiles', 'insert'), 'profiles: exactly three learner-editable columns');
select ok(has_table_privilege('authenticated', 'public.notification_preferences', 'insert')
      and has_table_privilege('authenticated', 'public.notification_preferences', 'update')
      and not has_table_privilege('authenticated', 'public.notification_preferences', 'delete'), 'notification_preferences: learner-editable, no delete');
select ok(exists (select 1 from pg_roles where rolname = 'authenticated' and 'statement_timeout=8s' = any (rolconfig)),
  'authenticated statement_timeout = 8s (db/config.ts statementTimeoutMs, set in 0002)');
select results_eq(
  $$ select jobname::text, schedule from cron.job where jobname in ('reminders-hourly', 'evaluations-hourly') order by jobname $$,
  $$ values ('evaluations-hourly', '30 * * * *'), ('reminders-hourly', '0 * * * *') $$,
  'both cron routes are scheduled by 0002');
select * from finish();
rollback;
