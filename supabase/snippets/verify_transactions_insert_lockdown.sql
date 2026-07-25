-- Verify 20260725180000_transactions_insert_lockdown.sql (issue #538).
--
-- Asserts the FINAL grant + policy state on public.transactions rather than the
-- text of the migration, so it also catches a later migration re-widening things
-- (including a schema dump that re-applies the original `GRANT ALL ... TO
-- authenticated`). Every row should report PASS. Run with:
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres \
--     -f - < supabase/snippets/verify_transactions_insert_lockdown.sql
--
-- (or paste into the Supabase SQL editor for the cloud project).
--
-- Companion to verify_transactions_column_hardening.sql (#528), which covers the
-- UPDATE half. Both should pass; either one alone leaves a route to the same row.

\echo '== 1. neither authenticated nor anon holds INSERT on transactions =='
SELECT
  r.rolname AS role,
  CASE WHEN has_table_privilege(r.rolname, 'public.transactions', 'INSERT')
       THEN 'FAIL' ELSE 'PASS' END AS result
FROM (VALUES ('authenticated'), ('anon')) AS r(rolname);

\echo '== 2. no column-level INSERT grant survives either (a table revoke leaves none, but a later migration could add one) =='
SELECT
  'column INSERT grants to authenticated' AS check,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.transactions'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
  ) THEN 'PASS' ELSE 'FAIL' END AS result,
  COALESCE((
    SELECT string_agg(a.attname, ', ' ORDER BY a.attname)
    FROM pg_attribute a
    WHERE a.attrelid = 'public.transactions'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
  ), '(none)') AS actual;

\echo '== 3. service_role KEEPS INSERT — every webhook, reconciler, cron and admin-client route depends on it =='
SELECT
  'service_role retains INSERT' AS check,
  CASE WHEN has_table_privilege('service_role', 'public.transactions', 'INSERT')
       THEN 'PASS' ELSE 'FAIL' END AS result;

\echo '== 4. the retained INSERT policy pins status = pending AND all four settlement columns NULL =='
SELECT
  polname AS policy,
  CASE WHEN pg_get_expr(polwithcheck, polrelid) LIKE '%pending%'
        AND pg_get_expr(polwithcheck, polrelid) LIKE '%settlement_currency IS NULL%'
        AND pg_get_expr(polwithcheck, polrelid) LIKE '%settlement_base IS NULL%'
        AND pg_get_expr(polwithcheck, polrelid) LIKE '%settlement_mint IS NULL%'
        AND pg_get_expr(polwithcheck, polrelid) LIKE '%settlement_sol_usd IS NULL%'
       THEN 'PASS' ELSE 'FAIL' END AS result,
  pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.transactions'::regclass
  AND polcmd = 'a';

\echo '== 5. the #528 UPDATE half is still in force — settlement columns unwritable after the row exists =='
SELECT
  a.attname AS column,
  CASE WHEN has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')
       THEN 'FAIL' ELSE 'PASS' END AS result
FROM pg_attribute a
WHERE a.attrelid = 'public.transactions'::regclass
  AND a.attname IN ('amount', 'settlement_base', 'settlement_currency',
                    'settlement_mint', 'settlement_sol_usd')
ORDER BY a.attname;

\echo '== 6. live proof: the exact under-quoted insert from #538 is rejected as `authenticated` =='
-- Rolled back either way; the point is which branch reports.
DO $$
DECLARE
  v_user uuid;
  v_tenant uuid;
  v_product integer;
BEGIN
  SELECT p.product_id, p.tenant_id INTO v_product, v_tenant
  FROM products p
  WHERE p.price > 0
  ORDER BY p.product_id
  LIMIT 1;

  SELECT tu.user_id INTO v_user
  FROM tenant_users tu
  WHERE tu.tenant_id = v_tenant AND tu.role = 'student'
  LIMIT 1;

  IF v_user IS NULL OR v_product IS NULL THEN
    RAISE NOTICE 'SKIP — no priced product with a student in the same tenant on this database';
    RETURN;
  END IF;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', v_tenant)::text,
      true);

    INSERT INTO public.transactions
      (user_id, tenant_id, product_id, amount, currency, status, payment_provider,
       settlement_currency, settlement_base)
    VALUES (v_user, v_tenant, v_product, 100, 'usd', 'pending', 'solana', 'sol', 1);

    RAISE EXCEPTION 'FAIL — the under-quoted insert succeeded';
  EXCEPTION
    -- Both layers report 42501: `permission denied for table transactions` from
    -- the revoked grant, or `new row violates row-level security policy` if the
    -- grant is ever restored and the policy catches it instead. SQLERRM says which.
    WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'PASS — rejected: %', SQLERRM;
  END;
END
$$;
