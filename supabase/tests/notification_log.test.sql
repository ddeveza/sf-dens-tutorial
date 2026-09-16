-- supabase/tests/notification_log.test.sql: the reminder route inserts the unique (user_id, kind, local_date) row FIRST and
-- sends only when the insert succeeded, so a double-fired cron cannot send twice. Written by db/admin.ts only.
-- Errcodes: 23505 unique, 23514 check, 42501 grant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local');

select lives_ok($$ insert into notification_log (user_id, kind, local_date, provider, status)
  values ('00000000-0000-0000-0000-00000000000a', 'daily_reminder', '2026-09-07', 'console', 'sent') $$,
  'the admin client inserts the idempotency row before sending');
select throws_ok($$ insert into notification_log (user_id, kind, local_date, provider, status)
  values ('00000000-0000-0000-0000-00000000000a', 'daily_reminder', '2026-09-07', 'console', 'sent') $$,
  '23505', null, 'a second insert for the same (user_id, kind, local_date) raises unique_violation');
select lives_ok($$ insert into notification_log (user_id, kind, local_date, provider, status, error)
  values ('00000000-0000-0000-0000-00000000000a', 'review_due', '2026-09-07', 'resend', 'failed', 'rate limited') $$,
  'another kind on the same local day is a different row');
select throws_ok($$ insert into notification_log (user_id, kind, local_date, provider, status)
  values ('00000000-0000-0000-0000-00000000000a', 'marketing', '2026-09-07', 'console', 'sent') $$,
  '23514', null, 'kind is constrained to the three reminder kinds');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from notification_log), 2, 'a learner reads their own log');
select throws_ok($$ insert into notification_log (user_id, kind, local_date, provider, status)
  values ('00000000-0000-0000-0000-00000000000a', 'streak_at_risk', '2026-09-07', 'console', 'sent') $$,
  '42501', null, 'sessions cannot write the log');
select * from finish();
rollback;
