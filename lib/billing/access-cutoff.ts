/**
 * Real access enforcement for over-limit tenants (issue #494).
 *
 * `has_course_access()` never considered a tenant's plan/billing state — a
 * tenant downgraded (or that simply outgrew its plan) kept full access to
 * every course indefinitely. This module is the single place that decides
 * and schedules `tenants.access_cutoff_at`, the timestamp
 * `has_course_access()` checks (see migration 20260724130000).
 *
 * Split mirrors `plan-limits.ts`: a pure decision function (unit-testable,
 * no DB) plus an impure reconciler that every plan-state transition calls —
 * the webhook-driven downgrade, both admin plan-change actions, the portal
 * change handler, and a daily cron sweep for organic growth over a limit
 * with no plan-change event. All of them can call `reconcileAccessCutoff`
 * freely; the decision function's null-check on `currentCutoffAt` makes
 * repeated calls idempotent (no double-scheduling, no duplicate emails).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { accessCutoffWarningTemplate } from '@/lib/email/templates/access-cutoff-warning'
import { countTenantUsage, computePlanLimitViolations, type PlanLimitViolation } from '@/lib/billing/plan-limits'
import { getTenantAdminEmails } from '@/lib/billing/tenant-admins'

export const ACCESS_CUTOFF_GRACE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export interface AccessCutoffDecision {
  action: 'schedule' | 'clear' | 'none'
  cutoffAt?: string
}

/**
 * Pure decision: should a cutoff be scheduled, cleared, or left alone.
 * `now` is injectable so callers/tests don't depend on wall-clock time.
 */
export function decideAccessCutoffAction(input: {
  violations: PlanLimitViolation[]
  currentCutoffAt: string | null
  now: Date
}): AccessCutoffDecision {
  const { violations, currentCutoffAt, now } = input

  if (violations.length > 0 && !currentCutoffAt) {
    const cutoffAt = new Date(now.getTime() + ACCESS_CUTOFF_GRACE_DAYS * DAY_MS).toISOString()
    return { action: 'schedule', cutoffAt }
  }

  if (violations.length === 0 && currentCutoffAt) {
    return { action: 'clear' }
  }

  return { action: 'none' }
}

function formatViolationReasons(violations: PlanLimitViolation[], planName: string): string[] {
  return violations.map((v) =>
    v.resource === 'courses'
      ? `${v.current} active courses exceed the ${planName} plan's limit of ${v.max}`
      : `${v.current} active students exceed the ${planName} plan's limit of ${v.max}`
  )
}

/**
 * Fetch a tenant's current plan/usage, decide, and apply: write
 * `access_cutoff_at` and (on `schedule`) email the tenant's admins with the
 * exact date and reasons. Safe to call from any plan-state transition —
 * a no-op when nothing needs to change.
 */
export async function reconcileAccessCutoff(
  admin: SupabaseClient,
  tenantId: string,
  opts?: { sendEmailFn?: typeof sendEmail; now?: Date }
): Promise<AccessCutoffDecision> {
  const sendEmailFn = opts?.sendEmailFn ?? sendEmail
  const now = opts?.now ?? new Date()

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, plan, access_cutoff_at')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) return { action: 'none' }

  const [{ data: plan }, usage] = await Promise.all([
    admin
      .from('platform_plans')
      .select('name, limits')
      .eq('slug', tenant.plan || 'free')
      .maybeSingle(),
    countTenantUsage(admin, tenantId),
  ])

  const violations = computePlanLimitViolations(
    usage,
    (plan?.limits as { max_courses?: number; max_students?: number } | null) ?? null
  )

  const decision = decideAccessCutoffAction({
    violations,
    currentCutoffAt: tenant.access_cutoff_at,
    now,
  })

  if (decision.action === 'none') return decision

  await admin
    .from('tenants')
    .update({ access_cutoff_at: decision.cutoffAt ?? null, updated_at: now.toISOString() })
    .eq('id', tenantId)

  if (decision.action === 'schedule' && decision.cutoffAt) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
    const template = accessCutoffWarningTemplate({
      schoolName: tenant.name || 'your school',
      planName: plan?.name || tenant.plan || 'Free',
      reasons: formatViolationReasons(violations, plan?.name || tenant.plan || 'Free'),
      cutoffDate: new Date(decision.cutoffAt).toLocaleDateString('en-US', { dateStyle: 'long' }),
      billingUrl: `${appUrl}/dashboard/admin/billing`,
    })

    const emails = await getTenantAdminEmails(admin, tenantId)
    for (const to of emails) {
      try {
        await sendEmailFn({ to, ...template })
      } catch (err) {
        console.error('reconcileAccessCutoff: email send failed', err)
      }
    }
  }

  return decision
}
