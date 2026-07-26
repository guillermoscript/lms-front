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
 * #550: those call sites were all *plan-change* events, and the cutoff email
 * asks for a *usage* action ("20 active courses exceed the Free plan's limit
 * of 15"). A school that did exactly what it was told — archived courses,
 * removed members — reconciled nothing and stayed locked out until the next
 * daily sweep, or indefinitely if nothing on the host calls `/api/cron/*`
 * (#513). Every action that can *reduce* usage now reconciles too, via
 * `reconcileAccessCutoffSafely`, and the admin billing page carries a manual
 * re-check so recovery never depends on a scheduler at all.
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
 *
 * `limitsKnown: false` says the caller could not resolve the tenant's plan
 * limits at all (#550 §3). An empty `violations` list then means "we don't
 * know", not "they comply", and the difference matters in exactly one
 * direction: scheduling stays fail-open (nothing is enforced off limits we
 * never read), while an existing cutoff is left standing rather than cleared.
 *
 * The asymmetry is deliberate. A `platform_plans` lookup misses because a slug
 * was renamed or a row deleted — an operator error, not a signal about the
 * school. Clearing on that miss lifts live enforcement school-wide, and the
 * only ways back are buying a bigger plan or a super admin editing the row.
 * Preserving it costs nothing: the next sweep that *can* read the limits
 * clears the cutoff on its own if the school is genuinely compliant.
 */
export function decideAccessCutoffAction(input: {
  violations: PlanLimitViolation[]
  currentCutoffAt: string | null
  now: Date
  limitsKnown?: boolean
}): AccessCutoffDecision {
  const { violations, currentCutoffAt, now, limitsKnown = true } = input

  if (violations.length > 0 && !currentCutoffAt) {
    const cutoffAt = new Date(now.getTime() + ACCESS_CUTOFF_GRACE_DAYS * DAY_MS).toISOString()
    return { action: 'schedule', cutoffAt }
  }

  if (violations.length === 0 && currentCutoffAt && limitsKnown) {
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
 *
 * #550: the ledger write is part of delivery, not bookkeeping after it. This
 * function used to log an upsert error and return `{ delivered: true }`
 * anyway, which inverted #517's whole point — the rung stayed unrecorded, so
 * `dueCutoffNotificationStage` re-derived it on the next sweep and every
 * tenant admin got the identical email daily until the cutoff cleared, while
 * the cron counted each repeat under `notified` and reported a healthy run.
 * RLS on `access_cutoff_notifications` is enabled with no policy
 * (`20260725100000:45`), so any non-service-role caller hit this every time.
 * Reporting `delivered: false` costs at most one extra send next sweep, which
 * is strictly better than an unbounded daily repeat that looks like success.
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

  if (error) {
    console.error('reconcileAccessCutoff: ledger write failed', error)
    return { delivered: false }
  }

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
    // A missing `platform_plans` row means the limits are unknown, not met
    // (#550 §3) — enough to skip scheduling, never enough to lift a cutoff.
    limitsKnown: !!plan,
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

  // Both paths consult the ledger (#550). The schedule branch used to force
  // `'scheduled'` outright, so a cron sweep racing a plan change sent the first
  // rung twice — `ignoreDuplicates` kept the ledger clean but two identical
  // emails had already left. Going through the ladder costs one indexed read
  // and needs no special case: on a fresh 14-day cutoff `scheduled` is the only
  // rung reached, so it is returned when unsent and `null` when already sent.
  const notifying = decision.action === 'schedule' || opts?.notifyDueStages === true
  const stage: AccessCutoffStage | null = notifying
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

/**
 * `reconcileAccessCutoff` for callers whose own write has already succeeded
 * (#550): archiving a course, deleting one, removing a member.
 *
 * Those actions are the school doing exactly what the cutoff email asked, and
 * the reconcile is a follow-up benefit — never a precondition. Failing the
 * archive because a counting query timed out would punish compliance with the
 * one thing the school is trying to escape, so every failure is logged and
 * swallowed. The reconciler is idempotent, so the worst case is that the state
 * stays as it was until the next reconcile (manual re-check or daily sweep).
 *
 * `notifyDueStages` is deliberately left off: user-facing actions must not pay
 * email latency for a reminder the cron sends anyway.
 */
export async function reconcileAccessCutoffSafely(
  admin: SupabaseClient,
  tenantId: string
): Promise<void> {
  try {
    await reconcileAccessCutoff(admin, tenantId)
  } catch (err) {
    console.error('reconcileAccessCutoffSafely: reconcile failed for tenant', tenantId, err)
  }
}
