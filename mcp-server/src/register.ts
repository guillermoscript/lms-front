import type { MCPServer } from "mcp-use/server";
import { recordToolAudit } from "./audit.js";
import { isToolAllowedForRole, roleOf } from "./tool-policy.js";
import { errorResult } from "./format.js";
import { BRANDING_META_KEY, getTenantBranding } from "./branding.js";
import { LmsSession } from "./session.js";

/**
 * Attach the caller's school branding to a widget result.
 *
 * Widget payloads carry `structuredContent`; plain text/JSON results do not, so
 * that is the test for "this renders a widget". The branding rides in `_meta`
 * rather than in props: it stays out of the model's context, and no widget's
 * `propsSchema` has to grow a field for it.
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
    const branding = await getTenantBranding(LmsSession.fromContext(ctx as never));
    if (!branding) return result;
    r._meta = { ...(r._meta ?? {}), [BRANDING_META_KEY]: branding };
  } catch {
    // No session (or the lookup failed) — leave the widget on the default theme.
  }
  return result;
}

/**
 * Per-tool guard wrapper.
 *
 * WHY THIS EXISTS (mcp-use 1.32.0):
 *   The `mcp:tools/call` middleware context exposes only the tool *arguments*
 *   as `ctx.params` — it does NOT carry the tool name. That makes name-based
 *   call gating and named audit logging impossible from middleware. The
 *   registered tool name, however, is known at registration time. So we
 *   monkey-patch `server.tool` once, before any tool is registered, and wrap
 *   every handler with:
 *     1. Role-based call gating — reject a disallowed tool for the caller's
 *        role (defense in depth on top of `tools/list` hiding, which is not
 *        security). Destructive ops (`lms_delete_*`, `lms_archive_course`) are
 *        admin-only; students get only the self-scoped learning tools.
 *     2. Audit logging — record the call (real tool name + sanitized args +
 *        success + duration) to `mcp_audit_log`.
 *
 * Install this BEFORE registering tools:
 *   installToolGuards(server);
 *   registerCourseTools(server); ...
 */
export function installToolGuards(server: MCPServer): void {
  const s = server as unknown as {
    tool: (config: { name: string } & Record<string, unknown>, handler: (input: unknown, ctx: unknown) => unknown) => unknown;
  };
  const original = s.tool.bind(server);

  s.tool = (config, handler) => {
    const name = config?.name ?? "";

    const wrapped = async (input: unknown, ctx: unknown) => {
      const auth = (ctx as { auth?: { user?: { userId?: string }; payload?: Record<string, unknown> } }).auth;
      const role = roleOf(ctx as { auth?: unknown });
      const start = Date.now();

      // 1. Call gating — name is known here (unlike in middleware).
      if (!isToolAllowedForRole(role, name)) {
        const msg =
          role === "teacher" || role === "student"
            ? `Tool '${name}' is not available for your role.${role === "student" ? " Students can use the lms_my_* learning tools." : " Contact an admin."}`
            : "Access denied: only students, teachers, and admins can use the LMS MCP server.";
        recordToolAudit({
          auth,
          toolName: name,
          args: input,
          success: false,
          errorMessage: msg,
          durationMs: Date.now() - start,
        });
        return errorResult(msg);
      }

      // 2. Run the real handler, then audit (fire-and-forget).
      let success = true;
      let errorMessage: string | undefined;
      try {
        const result = await handler(input, ctx);
        if (result && typeof result === "object" && (result as { isError?: boolean }).isError === true) {
          success = false;
        }
        return await brandWidgetResult(result, ctx);
      } catch (err) {
        success = false;
        errorMessage = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        recordToolAudit({
          auth,
          toolName: name,
          args: input,
          success,
          errorMessage,
          durationMs: Date.now() - start,
        });
      }
    };

    return original(config, wrapped);
  };
}
