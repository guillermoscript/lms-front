-- Fixes the remaining 2 confirmed advisor findings on MCP audit infrastructure:
--
-- 1. mcp_audit_summary (security_definer_view): ran as its creator, bypassing
--    mcp_audit_log's RLS. No app-code caller exists (mcp-server registers no
--    query against it; the Next app doesn't reference it either) — this is
--    pure ops/audit visibility with no legitimate client-side use case, so
--    beyond flipping to security_invoker, anon/authenticated SELECT is
--    revoked entirely and only service_role keeps access, mirroring the
--    get_platform_revenue lockdown pattern from the payment-provider fixes.
--
-- 2. mcp_audit_log: "System inserts audit logs" was WITH CHECK (true) for
--    role public — any anon/authenticated caller could forge audit rows
--    (arbitrary user_id/tool_name/success/error_message), undermining the
--    integrity of what's meant to be a tamper-evident trail. The only real
--    writer is mcp-server/src/audit.ts via getServiceClient() (service-role).
--    service_role has BYPASSRLS on this project (confirmed via pg_roles), so
--    dropping this policy is sufficient — no replacement policy is needed for
--    service_role, and anon/authenticated now have no INSERT path at all.
--    The existing SELECT policies (admin sees all, teacher sees own via
--    user_id = auth.uid()) are correctly scoped already and are untouched.

alter view public.mcp_audit_summary set (security_invoker = true);

revoke all on public.mcp_audit_summary from anon, authenticated;
grant select on public.mcp_audit_summary to service_role;

drop policy if exists "System inserts audit logs" on public.mcp_audit_log;
