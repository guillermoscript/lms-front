-- Issue #835 — claim_pending_pushes(). Rolled back. The Expo call is covered by
-- tests/unit/send-pushes.test.ts; this covers what the claim decides.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     < tests/sql/issue-835-claim-pending-pushes.sql
begin;

do $$
declare
  u_push   uuid := 'a1000000-0000-0000-0000-000000000004'; -- student@e2etest.com
  u_optout uuid := 'a1000000-0000-0000-0000-000000000002';
  u_nodev  uuid := 'a1000000-0000-0000-0000-000000000001';
  n_fresh bigint; n_stale bigint; n_extra bigint;
  r record;
begin
  -- clean slate for the pending set (rolled back)
  update user_notifications set push_sent = true where push_sent = false;

  insert into notifications (tenant_id, title, content, notification_type, priority, metadata, status)
  values ('00000000-0000-0000-0000-000000000001', '#835 fresh', 'body', 'info', 'high', '{"url":"/x","kind":"daily_digest"}', 'sent')
  returning id into n_fresh;
  insert into notifications (tenant_id, title, content, notification_type, status)
  values ('00000000-0000-0000-0000-000000000001', '#835 stale', 'body', 'info', 'sent')
  returning id into n_stale;
  insert into notifications (tenant_id, title, content, notification_type, status)
  values ('00000000-0000-0000-0000-000000000001', '#835 extra', 'body', 'info', 'sent')
  returning id into n_extra;

  delete from device_push_tokens where user_id in (u_push, u_optout, u_nodev);
  insert into device_push_tokens (user_id, token, platform) values
    (u_push,   'ExponentPushToken[835-a]', 'ios'),
    (u_push,   'ExponentPushToken[835-b]', 'android'),
    (u_optout, 'ExponentPushToken[835-c]', 'ios');
  insert into notification_preferences (user_id, push_enabled) values (u_optout, false)
  on conflict (user_id) do update set push_enabled = false;
  delete from notification_preferences where user_id = u_push;

  insert into user_notifications (notification_id, user_id) values
    (n_fresh, u_push), (n_fresh, u_optout), (n_fresh, u_nodev);
  insert into user_notifications (notification_id, user_id, created_at) values
    (n_stale, u_push, now() - interval '2 days');
  insert into user_notifications (notification_id, user_id, created_at) values
    (n_extra, u_push, now() + interval '1 minute');

  -- §1 the cap: one notification per call, oldest first
  select * into r from claim_pending_pushes(1, interval '1 day');
  if r.notification_id <> n_fresh then raise exception '§1 claimed % not %', r.notification_id, n_fresh; end if;
  if (select count(*) from claim_pending_pushes(0, interval '1 day')) <> 0 then raise exception '§1 cap 0 claimed'; end if;

  -- §2 opt-out and no-device recipients are counted but contribute no token
  if r.recipients <> 3 then raise exception '§2 recipients %', r.recipients; end if;
  if r.tokens::text[] @> array['ExponentPushToken[835-c]'] then raise exception '§2 opted-out token returned'; end if;
  if not (r.tokens @> array['ExponentPushToken[835-a]','ExponentPushToken[835-b]'] and cardinality(r.tokens) = 2) then
    raise exception '§2 tokens %', r.tokens;
  end if;
  if r.url <> '/x' or r.priority <> 'high' or r.kind is distinct from 'daily_digest' then raise exception '§2 payload % % %', r.url, r.priority, r.kind; end if;

  -- §3 every claimed row is marked sent with a timestamp
  if exists (select 1 from user_notifications where notification_id = n_fresh and (not push_sent or push_sent_at is null)) then
    raise exception '§3 claimed rows not marked sent';
  end if;

  -- §4 stale rows are marked sent without a push (push_sent_at NULL), never returned
  if not (select push_sent and push_sent_at is null from user_notifications where notification_id = n_stale) then
    raise exception '§4 stale row not retired';
  end if;

  -- §5 next call gets the remaining one, the call after that gets nothing
  select * into r from claim_pending_pushes(25, interval '1 day');
  if r.notification_id <> n_extra then raise exception '§5 got %', r.notification_id; end if;
  if (select count(*) from claim_pending_pushes(25, interval '1 day')) <> 0 then raise exception '§5 claimed twice'; end if;

  -- §6 only the service role may call it
  if has_function_privilege('authenticated', 'claim_pending_pushes(integer, interval)', 'execute')
     or has_function_privilege('anon', 'claim_pending_pushes(integer, interval)', 'execute') then
    raise exception '§6 callable by anon/authenticated';
  end if;

  -- §7 scheduled every minute when pg_cron exists
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and (select schedule from cron.job where jobname = 'send-pushes-every-minute') is distinct from '* * * * *' then
    raise exception '§7 schedule missing';
  end if;

  -- §8 the daily prune drops only send-pushes rows older than 7 days
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    insert into cron_runs (route, requested_at) values
      ('send-pushes', now() - interval '8 days'),
      ('send-pushes', now() - interval '6 days'),
      ('enforce-plan-limits', now() - interval '30 days');
    execute (select command from cron.job where jobname = 'prune-send-pushes-cron-runs');
    if exists (select 1 from cron_runs where route = 'send-pushes' and requested_at < now() - interval '7 days') then
      raise exception '§8 old send-pushes row kept';
    end if;
    if not exists (select 1 from cron_runs where route = 'send-pushes' and requested_at between now() - interval '7 days' and now() - interval '5 days') then
      raise exception '§8 recent send-pushes row deleted';
    end if;
    if not exists (select 1 from cron_runs where route = 'enforce-plan-limits' and requested_at < now() - interval '29 days') then
      raise exception '§8 other route row deleted';
    end if;
  end if;

  raise notice 'issue-835 claim_pending_pushes: all checks passed';
end $$;

rollback;
