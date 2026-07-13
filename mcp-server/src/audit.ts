import { getServiceClient } from "./supabase.js";

const SENSITIVE_KEYS = ["password", "secret", "token", "key", "credential"];

/** Strip obviously sensitive values before persisting params. */
function sanitizeParams(params: unknown): unknown {
  if (!params || typeof params !== "object") return params;
  const out: Record<string, unknown> = { ...(params as Record<string, unknown>) };
  for (const k of Object.keys(out)) {
    if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
      out[k] = "[REDACTED]";
    }
  }
  return out;
}

/** Minimal shape of the auth context we read for audit attribution. */
interface AuditAuth {
  user?: { userId?: string };
  payload?: Record<string, unknown>;
}

export interface AuditRecord {
  auth: AuditAuth | undefined;
  /** Tool name — captured at the registration layer (NOT available in middleware ctx). */
  toolName: string;
  /** The tool's arguments object. */
  args: unknown;
  success: boolean;
  errorMessage?: string;
  durationMs: number;
}

let insertFailures = 0;

/** Total failed audit inserts since server start (monitoring/tests). */
export function getAuditInsertFailureCount(): number {
  return insertFailures;
}

/**
 * Record one tool call into `mcp_audit_log` using the service-role client.
 *
 * Fire-and-forget: never throws, never blocks the caller. No-op when no
 * service-role key is configured.
 *
 * IMPORTANT (mcp-use 1.32.0): the `mcp:tools/call` middleware context exposes
 * only the tool *arguments* as `ctx.params` and does NOT carry the tool name,
 * so audit can't run as a generic middleware. It is invoked instead from the
 * per-tool wrapper in `register.ts`, which knows the registered tool name.
 */
export function recordToolAudit(rec: AuditRecord): void {
  const admin = getServiceClient();
  if (!admin) return;

  const payload = rec.auth?.payload ?? {};
  void admin
    .from("mcp_audit_log")
    .insert({
      user_id: rec.auth?.user?.userId ?? null,
      user_role:
        (payload.tenant_role as string | undefined) ??
        (payload.user_role as string | undefined) ??
        null,
      method: "tools/call",
      tool_name: rec.toolName || null,
      request_params: sanitizeParams(rec.args),
      success: rec.success,
      error_message: rec.errorMessage ?? null,
      duration_ms: rec.durationMs,
    })
    .then(({ error }: { error: unknown }) => {
      if (error) {
        insertFailures += 1;
        // Loud + counted: a persistent failure here (e.g. constraint/schema
        // drift, #401) means tool calls are going UNAUDITED.
        console.error(
          `[audit] INSERT FAILED (${insertFailures} since start) — tool call NOT audited`,
          {
            tool: rec.toolName,
            userRole:
              (payload.tenant_role as string | undefined) ??
              (payload.user_role as string | undefined) ??
              null,
            error,
          }
        );
      }
    });
}
