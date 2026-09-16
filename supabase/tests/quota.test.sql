-- supabase/tests/quota.test.sql: reserve_llm_call (check + increment, atomic, per-user lock) and check_llm_quota (read only).
-- Limits arrive as jsonb from lib/llm/config.ts; SQL holds no tunables. Errcodes: 22023 missing plan limits, 28000 no session.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local');
set local role authenticated;
select throws_ok($$ select * from reserve_llm_call('{"personal":{"hour":2,"day":10}}'::jsonb) $$, '28000', null,
  'no claims: reserve_llm_call raises unauthenticated');
select throws_ok($$ select * from check_llm_quota('{"personal":{"hour":2,"day":10}}'::jsonb) $$, '28000', null,
  'no claims: check_llm_quota finds no profile');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from check_llm_quota('{}'::jsonb) $$, '22023', null, 'missing plan limits raise 22023, never a null row');

select results_eq(
  $$ select allowed, remaining_hour, remaining_day, retry_after is null from reserve_llm_call('{"personal":{"hour":2,"day":10}}'::jsonb) $$,
  $$ values (true, 1, 9, true) $$, 'two below the hourly cap: allowed, remaining decremented, no retry_after');
select is((select count from llm_usage where hour_bucket = date_trunc('hour', now())), 1, 'reserve billed one call');

select results_eq(
  $$ select allowed, remaining_hour, remaining_day from reserve_llm_call('{"personal":{"hour":2,"day":10}}'::jsonb) $$,
  $$ values (true, 0, 8) $$, 'one below the hourly cap: still allowed');
select is((select count from llm_usage where hour_bucket = date_trunc('hour', now())), 2, 'second call billed');

select results_eq(
  $$ select allowed, remaining_hour, remaining_day, retry_after = date_trunc('hour', now()) + interval '1 hour'
     from reserve_llm_call('{"personal":{"hour":2,"day":10}}'::jsonb) $$,
  $$ values (false, 0, 8, true) $$, 'at the hourly cap: refused, retry_after = next hour bucket');
select is((select count from llm_usage where hour_bucket = date_trunc('hour', now())), 2, 'a refused call is not billed');

select results_eq(
  $$ select allowed, retry_after is null from reserve_llm_call('{"personal":{"hour":100,"day":2}}'::jsonb) $$,
  $$ values (false, true) $$, 'at the daily cap: refused, retry_after is set only for the hourly cap');
select is((select count from llm_usage where hour_bucket = date_trunc('hour', now())), 2, 'daily refusal not billed either');

select results_eq(
  $$ select allowed, remaining_hour, remaining_day from check_llm_quota('{"personal":{"hour":5,"day":10}}'::jsonb) $$,
  $$ values (true, 3, 8) $$, 'check_llm_quota reads the same counter');
select is((select count from llm_usage where hour_bucket = date_trunc('hour', now())), 2, 'check_llm_quota never increments');
select * from finish();
rollback;
