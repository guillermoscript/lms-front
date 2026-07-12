-- Advisor hygiene (post issue #280 payment-provider migrations): both
-- `handle_new_subscription` and `extend_subscription_period` are SECURITY
-- DEFINER but carried the default PUBLIC execute grant Postgres attaches at
-- creation, making them anon/authenticated-executable per the Supabase
-- linter. Neither is meant to be called directly by a client RPC — but they
-- differ in HOW they're actually invoked, so they get different treatment.
--
-- extend_subscription_period: only ever called via `admin.rpc(...)` using the
-- service-role client (webhook-dispatch.ts, cron/solana-pull/route.ts) — no
-- app code calls it as a normal user, and no trigger invokes it either. Locked
-- to service_role only, mirroring get_platform_revenue's existing pattern.
--
-- handle_new_subscription: NEVER called directly via `.rpc()` — it's invoked
-- from `trigger_manage_transactions()`, which is SECURITY INVOKER (not
-- DEFINER). That means the EXECUTE check runs against whatever role actually
-- updated/inserted the `transactions` row, not the trigger's owner. The mock
-- "pay with card" plan-enrollment path (app/[locale]/(public)/checkout/actions.ts
-- `enrollUser`) inserts a successful transaction using the caller's own
-- RLS-scoped session (role = authenticated) — so `authenticated` MUST keep
-- EXECUTE here or that flow breaks with a permission-denied error. Only the
-- PUBLIC/anon default grant is removed (anon has no path to insert a
-- successful transaction — RLS + getCurrentUserId() gate that server action).

revoke all on function public.extend_subscription_period(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.extend_subscription_period(text, text, timestamptz) to service_role;

revoke all on function public.handle_new_subscription(uuid, integer, integer, timestamptz) from public, anon;
grant execute on function public.handle_new_subscription(uuid, integer, integer, timestamptz) to authenticated, service_role;
