/**
 * Real access enforcement for over-limit tenants (issue #494) and the
 * notification ladder around it (issue #517).
 *
 * `has_course_access()` never considered a tenant's plan/billing state — a
 * tenant downgraded (or that simply outgrew its plan) kept full access to
 * every course indefinitely. This module is the single place that decides
 * and schedules `tenants.access_cutoff_at`, the timestamp
 * `has_course_access()` checks (see migration 20260724130000).
 *
 * Split mirrors `plan-limits.ts`: pure decision functions (unit-testable,
 * no DB) plus an impure reconciler that every plan-state transition calls —
 * the webhook-driven downgrade, both admin plan-change actions, the portal
 * change handler, and a daily cron sweep for organic growth over a limit
 * with no plan-change event. All of them can call `reconcileAccessCutoff`
 * freely; the decision function's null-check on `currentCutoffAt` makes
 * repeated calls idempotent (no double-scheduling, no duplicate emails).
 *
 * #517: that idempotence was also the communication bug. Because
 * `decideAccessCutoffAction` returns `'schedule'` exactly once per cutoff,
 * the school got exactly one email, 14 days out, with no retry if it failed
 * and no word at all on the day access actually stopped. The ladder below
 * (`scheduled` → `reminder_7d` → `reminder_1d` → `enforced`) fixes that: the
 * daily sweep passes `notifyDueStages` and sends whichever rung is due,
 * de-duplicated against the `access_cutoff_notifications` ledger.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import {
  accessCutoffWarningTemplate,
  type AccessCutoffStage,
} from '@/lib/email/templates/access-cutoff-warning'
import { countTenantUsage, computePlanLimitViolations, type PlanLimitViolation } from '@/lib/billing/plan-limits'
import { getTenantAdminEmails } from '@/lib/billing/tenant-admins'

export const ACCESS_CUTOFF_GRACE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export type { AccessCutoffStage }

export interface AccessCutoffDecision {
  action: 'schedule' | 'clear' | 'none'
  cutoffAt?: string
  /** #517: which notification rung was delivered on this call, if any. */
  notifiedStage?: AccessCutoffStage
  /** #517: a rung was due but nobody received it — the next sweep retries. */
  notifyFailed?: boolean
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

/**
 * Pure decision: which rung of the notification ladder is due right now.
 *
 * Returns **at most one** stage — always the most urgent rung whose trigger
 * point has been reached and which the ledger has not yet recorded. Sending
 * two rungs in one sweep would put contradictory messages in the same inbox
 * ("you have 7 days" beside "access is now paused"), so a less urgent rung
 * that was never delivered is superseded rather than queued behind the
 * urgent one.
 *
 * That "most urgent unsent" rule is also the retry #517 asks for: a stage
 * whose sends all failed is never written to the ledger, so it is still
 * unsent — and still the most urgent reached rung — on the next daily sweep.
 *
 * Once the cutoff has passed only `enforced` can be due; a future-tense
 * warning delivered after the fact is worse than silence.
 */
export function dueCutoffNotificationStage(input: {
  cutoffAt: string
  sentStages: AccessCutoffStage[]
  now: Date
}): AccessCutoffStage | null {
  const { cutoffAt, sentStages, now } = input

  const msRemaining = new Date(cutoffAt).getTime() - now.getTime()
  if (Number.isNaN(msRemaining)) return null

  const sent = new Set(sentStages)

  // Most urgent first; the first unsent one wins.
  const reached: AccessCutoffStage[] = []
  if (msRemaining <= 0) {
    reached.push('enforced')
  } else {
    if (msRemaining <= DAY_MS) reached.push('reminder_1d')
    if (msRemaining <= 7 * DAY_MS) reached.push('reminder_7d')
    reached.push('scheduled')
  }

  return reached.find((stage) => !sent.has(stage)) ?? null
}

function formatViolationReasons(violations: PlanLimitViolation[], planName: string): string[] {
  return violations.map((v) =>
    v.resource === 'courses'
      ? `${v.current} active courses exceed the ${planName} plan's limit of ${v.max}`
      : `${v.current} active students exceed the ${planName} plan's limit of ${v.max}`
  )
}

/** Which rungs the ledger already holds for this exact cutoff timestamp. */
async function fetchSentStages(
  admin: SupabaseClient,
  tenantId: string,
  cutoffAt: string
): Promise<AccessCutoffStage[]> {
  const { data } = await admin
    .from('access_cutoff_notifications')
    .select('stage')
    .eq('tenant_id', tenantId)
    .eq('cutoff_at', cutoffAt)

  return ((data as { stage: AccessCutoffStage }[] | null) ?? []).map((row) => row.stage)
}

/**
 * Send one rung to every tenant admin, then record it.
 *
 * The ledger row is written only when at least one address actually received
 * the mail. A rung nobody received stays unrecorded so the next sweep tries
 * again — the difference between "we told them" and "we attempted to tell
 * them" is the whole of #517's first gap.
 *
 * Delivery is judged on `sendEmail`'s boolean, not on whether it threw:
 * `lib/email/send.ts` swallows both a missing Mailgun config and a Mailgun API
 * error and returns `false`. #494's `try/catch` around the send was therefore
 * near-decorative — a dead mail provider produced a silent no-op that looked
 * exactly like success. Only `true` counts.
 */
async function deliverCutoffStage(
  admin: SupabaseClient,
  tenantId: string,
  stage: AccessCutoffStage,
  ctx: {
    cutoffAt: string
    schoolName: string
    planName: string
    violations: PlanLimitViolation[]
    sendEmailFn: typeof sendEmail
  }
): Promise<{ delivered: boolean }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
  const template = accessCutoffWarningTemplate({
    stage,
    schoolName: ctx.schoolName,
    planName: ctx.planName,
    reasons: formatViolationReasons(ctx.violations, ctx.planName),
    cutoffDate: new Date(ctx.cutoffAt).toLocaleDateString('en-US', { dateStyle: 'long' }),
    billingUrl: `${appUrl}/dashboard/admin/billing`,
  })

  const emails = await getTenantAdminEmails(admin, tenantId)
  let recipientCount = 0
  for (const to of emails) {
    try {
      if ((await ctx.sendEmailFn({ to, ...template })) === true) recipientCount++
      else console.error(`reconcileAccessCutoff: ${stage} email not delivered to ${to}`)
    } catch (err) {
      console.error(`reconcileAccessCutoff: ${stage} email send failed`, err)
    }
  }

  if (recipientCount === 0) {
    // Either the tenant has no active admin at all, or no send succeeded.
    // Both are worth retrying tomorrow; neither counts as delivered.
    console.error(
      `reconcileAccessCutoff: ${stage} notification not delivered for tenant ${tenantId} (${emails.length} candidate recipients)`
    )
    return { delivered: false }
  }

  // The unique (tenant_id, cutoff_at, stage) constraint is what actually
  // prevents repeats; ignoreDuplicates turns a race between the sweep and an
  // event-driven reconcile into a no-op rather than an error.
  const { error } = await admin
    .from('access_cutoff_notifications')
    .upsert(
      { tenant_id: tenantId, cutoff_at: ctx.cutoffAt, stage, recipient_count: recipientCount },
      { onConflict: 'tenant_id,cutoff_at,stage', ignoreDuplicates: true }
    )

  if (error) console.error('reconcileAccessCutoff: ledger write failed', error)

  return { delivered: true }
}

/**
 * Fetch a tenant's current plan/usage, decide, and apply: write
 * `access_cutoff_at` and (on `schedule`) email the tenant's admins with the
 * exact date and reasons. Safe to call from any plan-state transition —
 * a no-op when nothing needs to change.
 *
 * With `notifyDueStages` (the daily sweep passes it) it additionally sends
 * whichever rung of the reminder ladder is due for an already-scheduled
 * cutoff. Off by default so user-facing actions — joining a school, creating
 * a course — never pay email latency for a reminder the cron sends anyway.
 */
export async function reconcileAccessCutoff(
  admin: SupabaseClient,
  tenantId: string,
  opts?: { sendEmailFn?: typeof sendEmail; now?: Date; notifyDueStages?: boolean }
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

  if (decision.action !== 'none') {
    await admin
      .from('tenants')
      .update({ access_cutoff_at: decision.cutoffAt ?? null, updated_at: now.toISOString() })
      .eq('id', tenantId)
  }

  // The cutoff in force after this call: freshly scheduled, or the one already
  // on the row that survived a `none` decision (still over limit).
  const effectiveCutoffAt =
    decision.action === 'schedule'
      ? decision.cutoffAt!
      : decision.action === 'clear'
        ? null
        : tenant.access_cutoff_at

  if (!effectiveCutoffAt) return decision

  const stage: AccessCutoffStage | null =
    decision.action === 'schedule'
      ? 'scheduled'
      : opts?.notifyDueStages
        ? dueCutoffNotificationStage({
            cutoffAt: effectiveCutoffAt,
            sentStages: await fetchSentStages(admin, tenantId, effectiveCutoffAt),
            now,
          })
        : null

  if (!stage) return decision

  const { delivered } = await deliverCutoffStage(admin, tenantId, stage, {
    cutoffAt: effectiveCutoffAt,
    schoolName: tenant.name || 'your school',
    planName: plan?.name || tenant.plan || 'Free',
    violations,
    sendEmailFn,
  })

  return delivered ? { ...decision, notifiedStage: stage } : { ...decision, notifyFailed: true }
}
