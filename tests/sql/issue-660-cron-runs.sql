-- Issue #660 — pg_cron scheduler for enforce-plan-limits. Rolled back; the
-- HTTP path itself is asynchronous (pg_net worker) and is proven manually per
-- docs/CRON_RUNBOOK.md — this covers everything that is synchronous.
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres -P pager=off \
--     < tests/sql/issue-660-cron-runs.sql
begin;

do $$
declare
  run_id bigint; r record; secrets_present boolean;
begin
  -- §1 schedules exist when pg_cron does
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if (select count(*) from cron.job where jobname in ('enforce-plan-limits-daily','record-cron-run-results')) <> 2 then
      raise exception '§1 pg_cron jobs missing';
    end if;
    if (select schedule from cron.job where jobname = 'enforce-plan-limits-daily') <> '0 3 * * *' then
      raise exception '§1 wrong schedule';
    end if;
  end if;

  -- §2 invalid route names are refused before anything is written
  begin
    perform public.invoke_cron_route('../etc');
    raise exception '§2 invalid route accepted';
  exception when others then
    if sqlerrm not like 'invoke_cron_route: invalid route%' then raise; end if;
  end;

  -- §3 missing Vault secrets → a ledger row with `error`, no request, no failure
  select exists (select 1 from vault.secrets where name in ('cron_secret','cron_base_url')) into secrets_present;
  if not secrets_present then
    run_id := public.invoke_cron_route('enforce-plan-limits');
    select * into r from public.cron_runs where id = run_id;
    if r.request_id is not null or r.error is null or r.completed_at is null then
      raise exception '§3 unconfigured invoke did not record an error row: %', to_jsonb(r);
    end if;
  else
    raise notice '§3 skipped: vault secrets present in this environment';
  end if;

  -- §4 a run older than 6 h with no response is closed by the recorder
  insert into public.cron_runs (route, request_id, requested_at)
  values ('enforce-plan-limits', 2147483647, now() - interval '7 hours') returning id into run_id;
  perform public.record_cron_run_results();
  select * into r from public.cron_runs where id = run_id;
  if r.completed_at is null or r.error not like 'no response recorded%' then
    raise exception '§4 stale run not closed: %', to_jsonb(r);
  end if;

  -- §5 the ledger is not readable by app roles
  if has_table_privilege('authenticated', 'public.cron_runs', 'SELECT')
     or has_table_privilege('anon', 'public.cron_runs', 'SELECT') then
    raise exception '§5 cron_runs readable by app roles';
  end if;

  raise notice 'PASS: issue #660 cron_runs + invoker';
end $$;

rollback;
