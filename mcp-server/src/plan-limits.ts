import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plan-limit awareness for the MCP tools (issue #658).
 *
 * The `enforce_course_plan_limit` / `enforce_student_plan_limit` triggers
 * raise SQLSTATE `LM001` (`plan_limit_exceeded:<resource>`) when a write
 * would push the tenant past `platform_plans.limits`. The MCP server runs on
 * the caller's own RLS-scoped token, so it cannot count a tenant's courses
 * itself (a teacher only sees their own) — the `get_tenant_plan_usage` RPC
 * does that server-side for members of the tenant.
 */

export const PLAN_LIMIT_SQLSTATE = "LM001";

export type PlanLimitResource = "courses" | "students";

const MESSAGE_PATTERN = /plan_limit_exceeded:(courses|students)/;

export function isPlanLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return (
    code === PLAN_LIMIT_SQLSTATE ||
    (typeof message === "string" && MESSAGE_PATTERN.test(message))
  );
}

export interface TenantPlanUsage {
  courses: number;
  students: number;
  /** `-1` means unlimited. */
  max_courses: number;
  /** `-1` means unlimited. */
  max_students: number;
}

export async function getTenantPlanUsage(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantPlanUsage | null> {
  const { data, error } = await supabase.rpc("get_tenant_plan_usage", {
    _tenant_id: tenantId,
  });
  if (error || !data) return null;
  const usage = data as Partial<TenantPlanUsage>;
  return {
    courses: usage.courses ?? 0,
    students: usage.students ?? 0,
    max_courses: usage.max_courses ?? -1,
    max_students: usage.max_students ?? -1,
  };
}

function formatLimitMessage(resource: PlanLimitResource, usage: TenantPlanUsage | null): string {
  const noun = resource === "courses" ? "courses" : "students";
  if (!usage) {
    return `The school's plan does not allow more ${noun}. Ask a school admin to upgrade the plan.`;
  }
  const max = resource === "courses" ? usage.max_courses : usage.max_students;
  const current = resource === "courses" ? usage.courses : usage.students;
  return (
    `The school's plan is limited to ${max} ${noun} and it currently has ${current}. ` +
    (resource === "courses"
      ? "Archive a course or ask a school admin to upgrade the plan."
      : "Ask a school admin to upgrade the plan.")
  );
}

/** Upgrade copy for a write the database refused with `LM001`. */
export async function planLimitMessage(
  supabase: SupabaseClient,
  tenantId: string,
  resource: PlanLimitResource
): Promise<string> {
  return formatLimitMessage(resource, await getTenantPlanUsage(supabase, tenantId));
}

/**
 * Pre-check before a write that would add one non-archived course. Returns the
 * upgrade message when the tenant has no headroom, `null` when it does or when
 * usage could not be read (the trigger still decides in that case).
 */
export async function courseLimitHeadroomError(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string | null> {
  const usage = await getTenantPlanUsage(supabase, tenantId);
  if (!usage || usage.max_courses < 0) return null;
  if (usage.courses >= usage.max_courses) return formatLimitMessage("courses", usage);
  return null;
}
