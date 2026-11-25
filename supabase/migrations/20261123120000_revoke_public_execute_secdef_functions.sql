-- Security: close caller-less SECURITY DEFINER RPCs reported via email (2026-11-12).
--
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon + authenticated, and `REVOKE ... FROM PUBLIC` does not remove those
-- explicit grants. These functions never check auth.uid()/role/tenant
-- membership, so anyone with the anon key could call them through
-- /rest/v1/rpc/*. All of them are only used by the service-role client,
-- pg_cron (runs as postgres) or not at all, so revoking does not break the app.
--
--  * save_product_creation_wizard : cross-tenant course/product/price writes
--                                   (only called via adminClient in app/actions/admin/products.ts)
--  * override_exam_score          : anyone could rewrite any exam score (unused by the app)
--  * invoke_cron_route            : fired internal cron HTTP calls with the cron secret
--  * record_cron_run_results / publish_scheduled_lessons /
--    refresh_leaderboard_cache / cleanup_old_preview_sessions /
--    handle_student_subscription_expiry : cron-only jobs

REVOKE EXECUTE ON FUNCTION public.save_product_creation_wizard(uuid, uuid, text, text, integer, jsonb, text, integer, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_creation_wizard(uuid, uuid, text, text, integer, jsonb, text, integer, jsonb, jsonb)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.override_exam_score(integer, uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.override_exam_score(integer, uuid, numeric, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.invoke_cron_route(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_cron_route(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_cron_run_results() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_scheduled_lessons() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_leaderboard_cache() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_preview_sessions() FROM PUBLIC, anon, authenticated;

-- Cron-only (pg_cron runs as postgres): expires student subscriptions, no caller check.
REVOKE EXECUTE ON FUNCTION public.handle_student_subscription_expiry() FROM PUBLIC, anon, authenticated;
