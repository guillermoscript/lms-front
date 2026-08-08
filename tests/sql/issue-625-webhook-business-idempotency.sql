-- Real-Postgres replay proof for issue #625. All fixture mutations roll back.
begin;

-- Local seed history currently has a stale renewal trigger dependency unrelated
-- to #625. Disable only inside this transaction; ROLLBACK restores it.
alter table public.transactions disable trigger after_transaction_update;

do $$
declare
  transaction_key bigint;
  original_refunded numeric;
  sale_amount numeric;
  after_replay numeric;
  tenant_key uuid;
  plan_key uuid;
  first_period_end timestamptz;
  second_period_end timestamptz;
  replay_period_end timestamptz;
begin
  select transaction_id, refunded_amount, amount
  into transaction_key, original_refunded, sale_amount
  from public.transactions
  where status = 'successful'
    and amount >= 3
  order by transaction_id
  limit 1;

  if transaction_key is null then
    raise exception 'issue #625 SQL test needs one successful transaction fixture';
  end if;

  perform * from public.apply_webhook_refund(
    'issue625-test', 'refund-A', transaction_key, 1
  );
  perform * from public.apply_webhook_refund(
    'issue625-test', 'refund-B', transaction_key, 1
  );
  perform * from public.apply_webhook_refund(
    'issue625-test', 'refund-A', transaction_key, 1
  );

  select refunded_amount into after_replay
  from public.transactions
  where transaction_id = transaction_key;

  if after_replay <> least(sale_amount, original_refunded + 2) then
    raise exception 'A,B,A refund replay applied wrong total: expected %, got %',
      least(sale_amount, original_refunded + 2), after_replay;
  end if;

  select t.id, p.plan_id
  into tenant_key, plan_key
  from public.tenants t
  cross join public.platform_plans p
  order by t.created_at, p.sort_order
  limit 1;

  if tenant_key is null or plan_key is null then
    raise exception 'issue #625 SQL test needs tenant and platform plan fixtures';
  end if;

  select period_end into first_period_end
  from public.apply_self_managed_platform_period(
    'binance', 'period-A', tenant_key, plan_key, 'starter', 'monthly', 'order-A', null
  );
  select period_end into second_period_end
  from public.apply_self_managed_platform_period(
    'binance', 'period-B', tenant_key, plan_key, 'starter', 'monthly', 'order-B', null
  );
  select period_end into replay_period_end
  from public.apply_self_managed_platform_period(
    'binance', 'period-A', tenant_key, plan_key, 'starter', 'monthly', 'order-A', null
  );

  if second_period_end <= first_period_end then
    raise exception 'second distinct self-managed payment did not extend period';
  end if;
  if replay_period_end <> second_period_end then
    raise exception 'A,B,A self-managed replay extended A twice: expected %, got %',
      second_period_end, replay_period_end;
  end if;

  delete from public.platform_subscriptions where tenant_id = tenant_key;
  begin
    perform * from public.apply_self_managed_platform_period(
      'binance', 'period-A', tenant_key, plan_key, 'starter', 'monthly', 'order-A', null
    );
    raise exception 'replayed effect recreated a subscription without a durable period';
  exception
    when no_data_found then null;
  end;
end;
$$;

rollback;
