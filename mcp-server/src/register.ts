import { recordToolAudit } from "./audit.js";
import { isToolAllowedForRole } from "./tool-policy.js";
import { errorResult } from "./format.js";
import { BRANDING_META_KEY, getTenantBranding } from "./branding.js";
import { LmsSession, resolveMcpAuth, roleOfAuth } from "./session.js";
import type { LmsServer } from "./server-types.js";

/**
 * Attach the caller's school branding to a widget result.
 *
 * Widget payloads carry `structuredContent`; plain text/JSON results do not, so
 * that is the test for "this renders a widget". The branding rides in `_meta`
 * rather than in props: it stays out of the model's context, and no widget's
 * props schema has to grow a field for it.
 *
 * Everything here is best-effort. An unauthenticated caller, a tenant with no
 * colours, or a failed lookup all return the result untouched, and the widget
 * falls back to the platform palette.
 */
export async function brandWidgetResult(result: unknown, ctx: unknown): Promise<unknown> {
  if (!result || typeof result !== "object") return result;
  const r = result as { structuredContent?: unknown; _meta?: Record<string, unknown> };
  if (!r.structuredContent) return result;

  try {
    const branding = await getTenantBranding(LmsSession.fromContext(ctx));
    if (!branding) return result;
    r._meta = { ...(r._meta ?? {}), [BRANDING_META_KEY]: branding };
  } catch {
    // No session (or the lookup failed) — leave the widget on the default theme.
  }
  return result;
}

/**
 * Call-time guard middleware (`mcp:tools/call`).
 *
 * mcp-use v2 middleware carries the tool name (`ctx.params.name`) and the
 * arguments (`ctx.params.arguments`) — the v1.32 limitation that forced a
 * per-registration monkey-patch is gone, so gating, branding, and audit all
 * live in one typed middleware:
 *   1. Role-based call gating — reject a disallowed tool for the caller's
 *      role (defense in depth on top of `tools/list` hiding, which is not
 *      security). Destructive ops (`lms_delete_*`, `lms_archive_course`) are
 *      admin-only; students get only the self-scoped learning tools.
 *   2. Tenant branding — attach `_meta["lms/branding"]` to widget results.
 *   3. Audit logging — record the call (tool name + sanitized args + success
 *      + duration) to `mcp_audit_log`, fire-and-forget.
 */
export function installToolGuards(server: LmsServer): void {
  server.use("mcp:tools/call", async (ctx, next) => {
    const name = ctx.params.name ?? "";
    const args = ctx.params.arguments;
    const auth = resolveMcpAuth(ctx);
    const role = roleOfAuth(auth);
    const start = Date.now();

    // 1. Call gating.
    if (!isToolAllowedForRole(role, name)) {
      const msg =
        role === "teacher" || role === "student"
          ? `Tool '${name}' is not available for your role.${role === "student" ? " Students can use the lms_my_* learning tools." : " Contact an admin."}`
          : "Access denied: only students, teachers, and admins can use the LMS MCP server.";
      recordToolAudit({
        auth,
        toolName: name,
        args,
        success: false,
        errorMessage: msg,
        durationMs: Date.now() - start,
      });
      return errorResult(msg);
    }

    // 2. Run the real handler, brand widget results, then audit.
    let success = true;
    let errorMessage: string | undefined;
    try {
      const result = await next();
      if (result && typeof result === "object" && (result as { isError?: boolean }).isError === true) {
        success = false;
      }
      return (await brandWidgetResult(result, ctx)) as typeof result;
    } catch (err) {
      success = false;
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      recordToolAudit({
        auth,
        toolName: name,
        args,
        success,
        errorMessage,
        durationMs: Date.now() - start,
      });
    }
  });
}
