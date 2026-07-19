/**
 * Pre-flight plan-limit check for platform (school → platform) billing.
 *
 * Answers one question BEFORE any Stripe mutation: does the tenant's current
 * usage fit within a TARGET plan's limits? Running this ahead of the Stripe
 * call lets an over-limit downgrade be blocked with actionable "reduce N"
 * messaging, instead of the reactive "apply then revert on Stripe" path in
 * `lib/payments/platform-plan-change.ts` (issue #461) that only kicks in after
 * a portal-initiated change has already happened.
 *
 * Source of truth for limits: `platform_plans.limits` `{max_courses,
 * max_students}` where `-1` means unlimited. Usage counts match the canonical
 * queries used everywhere else in the codebase — non-archived courses and
 * active student memberships.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type PlanLimits = { max_courses?: number; max_students?: number } | null

export interface PlanLimitViolation {
  resource: 'courses' | 'students'
  current: number
  max: number
  /** How many of `resource` must be removed to fit under `max`. */
  reduceBy: number
}

export interface TenantUsage {
  courses: number
  students: number
}

export interface PlanLimitCheckResult {
  ok: boolean
  planName: string | null
  usage: TenantUsage
  violations: PlanLimitViolation[]
}

/**
 * Count a tenant's usage against the metrics that plan limits constrain:
 * non-archived courses and active student memberships. Kept separate from the
 * comparison so callers that already hold a plan's limits in memory (e.g. the
 * webhook reconciler) can reuse the counts without re-fetching the plan.
 */
export async function countTenantUsage(
  admin: SupabaseClient,
  tenantId: string
): Promise<TenantUsage> {
  const [coursesResult, studentsResult] = await Promise.all([
    admin
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .neq('status', 'archived'),
    admin
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'student')
      .eq('status', 'active'),
  ])

  return {
    courses: coursesResult.count ?? 0,
    students: studentsResult.count ?? 0,
  }
}

/**
 * Pure comparison of usage against a plan's limits. `-1` (or a missing key)
 * means unlimited and never produces a violation.
 */
export function computePlanLimitViolations(
  usage: TenantUsage,
  limits: PlanLimits
): PlanLimitViolation[] {
  const maxCourses = limits?.max_courses ?? -1
  const maxStudents = limits?.max_students ?? -1

  const violations: PlanLimitViolation[] = []
  if (maxCourses !== -1 && usage.courses > maxCourses) {
    violations.push({
      resource: 'courses',
      current: usage.courses,
      max: maxCourses,
      reduceBy: usage.courses - maxCourses,
    })
  }
  if (maxStudents !== -1 && usage.students > maxStudents) {
    violations.push({
      resource: 'students',
      current: usage.students,
      max: maxStudents,
      reduceBy: usage.students - maxStudents,
    })
  }
  return violations
}

/**
 * Resolve a target plan (by `plan_id` or `slug`), count the tenant's usage, and
 * report whether the tenant fits within that plan's limits.
 *
 * Fail-open on an unknown target plan (returns `ok: true` with no plan name),
 * matching the long-standing behavior of the manual-confirmation limit check —
 * a missing plan row must not silently block a legitimate change.
 */
export async function checkPlanLimits(
  admin: SupabaseClient,
  tenantId: string,
  target: { planId?: string; slug?: string }
): Promise<PlanLimitCheckResult> {
  if (!target.planId && !target.slug) {
    const usage = await countTenantUsage(admin, tenantId)
    return { ok: true, planName: null, usage, violations: [] }
  }

  let planQuery = admin.from('platform_plans').select('name, limits')
  planQuery = target.planId
    ? planQuery.eq('plan_id', target.planId)
    : planQuery.eq('slug', target.slug as string)

  const [planResult, usage] = await Promise.all([
    planQuery.maybeSingle(),
    countTenantUsage(admin, tenantId),
  ])

  const plan = planResult.data as { name: string; limits: PlanLimits } | null
  if (!plan) {
    return { ok: true, planName: null, usage, violations: [] }
  }

  const violations = computePlanLimitViolations(usage, plan.limits)
  return { ok: violations.length === 0, planName: plan.name, usage, violations }
}

/**
 * Human-readable one-line summary of violations, preserving the exact wording
 * the manual-confirmation path has always thrown so existing UX is unchanged.
 * Returns `null` when there are no violations.
 */
export function formatPlanLimitError(result: PlanLimitCheckResult): string | null {
  if (result.ok || result.violations.length === 0) return null
  const planName = result.planName ?? 'target'
  const parts = result.violations.map((v) =>
    v.resource === 'courses'
      ? `You have ${v.current} active courses but the ${planName} plan allows ${v.max}. Archive ${v.reduceBy} course(s) before downgrading.`
      : `You have ${v.current} students but the ${planName} plan allows ${v.max}.`
  )
  return parts.join(' ')
}
