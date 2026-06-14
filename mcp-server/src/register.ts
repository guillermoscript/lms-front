import type { MCPServer } from "mcp-use/server";
import { recordToolAudit } from "./audit.js";
import { isToolAllowedForRole, roleOf } from "./tool-policy.js";
import { errorResult } from "./format.js";

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
 *        admin-only; non-teacher/admin callers get nothing.
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
          role === "teacher"
            ? `Tool '${name}' is not available for your role. Contact an admin.`
            : "Access denied: only teachers and admins can use the LMS MCP server.";
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
        return result;
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
