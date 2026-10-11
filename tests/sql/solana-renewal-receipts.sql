-- Local Devnet fixture contract: requires subscription 10002. All synthetic state
-- and signatures are rolled back; this does not exercise payment on-chain.
BEGIN;
DO $$
DECLARE failure_id integer; paid_id integer; retry_id integer; current_status text;
BEGIN
  IF has_function_privilege('authenticated', 'public.record_solana_renewal(integer,timestamptz,timestamptz,numeric,boolean,jsonb,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Students must not write payment receipts';
  END IF;
  failure_id := public.record_solana_renewal(10002, '2030-01-01 00:00Z', '2030-01-01 01:00Z', 0.01, false, '[]', 'insufficient_funds', 'devnet');
  SELECT subscription_status INTO current_status FROM public.subscriptions WHERE subscription_id = 10002;
  IF current_status <> 'past_due' THEN RAISE EXCEPTION 'Failed retry must be past_due, not canceled'; END IF;
  IF (SELECT status FROM public.transactions WHERE transaction_id = failure_id) <> 'failed' THEN RAISE EXCEPTION 'Failed retry cannot be successful'; END IF;
  paid_id := public.record_solana_renewal(10002, '2030-01-01 00:00Z', '2030-01-01 01:00Z', 0.01, true, '["rollback-only-test-signature"]', NULL, 'devnet');
  IF paid_id <> failure_id THEN RAISE EXCEPTION 'Recovery must reuse the period receipt'; END IF;
  retry_id := public.record_solana_renewal(10002, '2030-01-01 00:00Z', '2030-01-01 01:00Z', 0.01, false, '[]', 'insufficient_funds', 'devnet');
  IF retry_id <> paid_id THEN RAISE EXCEPTION 'Duplicate retry must reuse the receipt'; END IF;
  IF (SELECT subscription_status FROM public.subscriptions WHERE subscription_id = 10002) <> 'active' THEN RAISE EXCEPTION 'Late failure downgraded paid subscription'; END IF;
  IF (SELECT expires_at FROM public.entitlements WHERE source_type = 'subscription' AND source_id = 10002 LIMIT 1) <> '2030-01-01 01:00Z'::timestamptz THEN RAISE EXCEPTION 'Recovery must align access with paid period'; END IF;
  RAISE NOTICE 'PASS: privilege, failed status, recovery, duplicate receipt, late-failure guard, entitlement alignment';
END;
$$;
ROLLBACK;
