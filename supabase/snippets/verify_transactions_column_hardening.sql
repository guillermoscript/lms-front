-- Verify 20260725170000_transactions_column_hardening.sql (issue #528).
--
-- Asserts the FINAL grant + policy state on public.transactions rather than the
-- text of the migration, so it also catches a later migration re-widening things.
-- Every row should report PASS. Run with:
--
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres \
--     -f - < supabase/snippets/verify_transactions_column_hardening.sql
--
-- (or paste into the Supabase SQL editor for the cloud project).

\echo '== 1. authenticated must NOT hold table-level INSERT/UPDATE beyond the column grant =='
SELECT
  'table-level UPDATE revoked from authenticated' AS check,
  CASE WHEN NOT has_table_privilege('authenticated', 'public.transactions', 'UPDATE')
       THEN 'PASS' ELSE 'FAIL' END AS result;

\echo '== 2. exactly the three intended columns are UPDATE-able by authenticated =='
SELECT
  'column UPDATE grants' AS check,
  CASE WHEN (
    SELECT array_agg(a.attname::text ORDER BY a.attname)
    FROM pg_attribute a
    WHERE a.attrelid = 'public.transactions'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')
  ) = ARRAY['provider_subscription_id', 'status', 'stripe_payment_intent_id']
  THEN 'PASS' ELSE 'FAIL' END AS result,
  (
    SELECT string_agg(a.attname, ', ' ORDER BY a.attname)
    FROM pg_attribute a
    WHERE a.attrelid = 'public.transactions'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')
  ) AS actual;

\echo '== 3. financial columns are NOT UPDATE-able by authenticated =='
SELECT
  a.attname AS column,
  CASE WHEN has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')
       THEN 'FAIL' ELSE 'PASS' END AS result
FROM pg_attribute a
WHERE a.attrelid = 'public.transactions'::regclass
  AND a.attname IN ('amount', 'currency', 'product_id', 'plan_id', 'payment_provider',
                    'user_id', 'tenant_id', 'settlement_base', 'settlement_currency',
                    'school_percentage_snapshot')
ORDER BY a.attname;

\echo '== 4. the INSERT policy pins status = pending =='
SELECT
  polname AS policy,
  CASE WHEN pg_get_expr(polwithcheck, polrelid) LIKE '%pending%'
       THEN 'PASS' ELSE 'FAIL' END AS result,
  pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.transactions'::regclass
  AND polcmd = 'a';

\echo '== 5. the UPDATE policy cannot reach successful/refunded =='
SELECT
  polname AS policy,
  CASE WHEN pg_get_expr(polqual, polrelid) LIKE '%pending%'
        AND pg_get_expr(polwithcheck, polrelid) LIKE '%pending%'
        AND pg_get_expr(polwithcheck, polrelid) LIKE '%failed%'
        AND pg_get_expr(polwithcheck, polrelid) NOT LIKE '%successful%'
        AND pg_get_expr(polwithcheck, polrelid) NOT LIKE '%refunded%'
       THEN 'PASS' ELSE 'FAIL' END AS result,
  pg_get_expr(polqual, polrelid) AS using_expr,
  pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.transactions'::regclass
  AND polcmd = 'w';

\echo '== 6. RLS is still enabled, and there is still no DELETE path for authenticated =='
SELECT
  'RLS enabled' AS check,
  CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class WHERE oid = 'public.transactions'::regclass
UNION ALL
SELECT
  'DELETE not granted to authenticated',
  CASE WHEN NOT has_table_privilege('authenticated', 'public.transactions', 'DELETE')
       THEN 'PASS' ELSE 'FAIL' END;
