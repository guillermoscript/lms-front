import type { MCPServer, MiddlewareContext, McpMiddlewareFn } from "mcp-use/server";

/**
 * Role-based tool access (Option A).
 *
 *   admin   → every tool.
 *   teacher → create/edit/browse own content + analytics for THEIR OWN courses
 *             (RLS + ownership checks already scope analytics to owned courses),
 *             BUT NOT destructive ops (delete/archive).
 *   other   → no tools (LmsSession already rejects non-teacher/admin callers).
 *
 * Deletes are matched by prefix so future `lms_delete_*` tools are covered
 * automatically.
 *
 * ── mcp-use 1.32.0 middleware reality ──────────────────────────────────────
 * Two facts about this version shape how the policy is enforced:
 *   1. `mcp:tools/list` middleware receives the bare tools **array** as the
 *      result of `next()` (mcp-use unwraps `result.tools` before calling the
 *      chain and re-wraps an array return). So the list filter must operate on
 *      an array, not `{ tools: [...] }`.
 *   2. `mcp:tools/call` middleware ctx exposes only the tool *arguments* as
 *      `ctx.params` — the tool **name is not present**. Name-based call gating
 *      therefore cannot live in middleware; it runs in the per-tool wrapper
 *      (`register.ts`), which is given the registered name. This module only
 *      hides disallowed tools from `tools/list`.
 */
const TEACHER_DENY_PREFIXES = ["lms_delete_"];

const TEACHER_DENY_TOOLS = new Set<string>([
  // Destructive — admin only. Analytics tools stay allowed for teachers because
  // they are ownership-scoped (a teacher only ever sees their own courses' data).
  "lms_archive_course",
]);

export function isToolAllowedForRole(
  role: string | undefined,
  toolName: string
): boolean {
  if (role === "admin") return true;
  if (role !== "teacher") return false;
  if (TEACHER_DENY_PREFIXES.some((p) => toolName.startsWith(p))) return false;
  return !TEACHER_DENY_TOOLS.has(toolName);
}

/** Read the caller's tenant role from the verified JWT claims. */
export function roleOf(ctx: MiddlewareContext | { auth?: unknown }): string | undefined {
  const payload = (ctx.auth as { payload?: Record<string, unknown> } | undefined)
    ?.payload;
  return (
    (payload?.tenant_role as string | undefined) ??
    (payload?.user_role as string | undefined)
  );
}

/**
 * Install `tools/list` gating: hide tools the caller's role may not use.
 *
 * Call-time enforcement (rejecting a disallowed `tools/call`) lives in the
 * per-tool wrapper, see `installToolGuards` in `register.ts` — hiding is not
 * security on its own.
 */
export function installToolPolicy(server: MCPServer): void {
  const use = (
    server as unknown as {
      use: (pattern: string, handler: McpMiddlewareFn) => void;
    }
  ).use.bind(server);

  use("mcp:tools/list", async (ctx, next) => {
    const role = roleOf(ctx);
    const result = await next();

    // mcp-use 1.32.0 hands the chain the bare tools array; older/other shapes
    // may hand `{ tools: [...] }`. Handle both so the filter never silently
    // no-ops if the framework changes the contract.
    if (Array.isArray(result)) {
      return (result as Array<{ name: string }>).filter((t) =>
        isToolAllowedForRole(role, t.name)
      );
    }
    const obj = result as { tools?: Array<{ name: string }> } | null;
    if (obj?.tools) {
      obj.tools = obj.tools.filter((t) => isToolAllowedForRole(role, t.name));
    }
    return obj;
  });
}
