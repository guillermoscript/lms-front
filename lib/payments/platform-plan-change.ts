/**
 * Portal plan-change handler for the platform (school → platform) billing
 * webhook.
 *
 * Applies a price change made at the PROVIDER — a school using its billing
 * portal, or any out-of-band swap — to our plan state (`tenants.plan`,
 * `platform_subscriptions.plan_id`, `revenue_splits`), enforcing the target
 * plan's course/student limits on downgrades.
 *
 * Invariant this module exists to protect: the provider's subscription price
 * and the DB plan may NEVER disagree after the webhook returns. A downgrade
 * that exceeds the target plan's limits is REVERTED at the provider (back to
 * the old plan's price, no proration) and school admins are notified; if the
 * revert is impossible (old plan has no price on that provider, or the provider
 * cannot swap in place) or fails, the downgrade is applied to the DB instead —
 * consistency wins over enforcement — and admins are warned they are over the
 * new plan's limits.
 *
 * The revert triggers an echo subscription-updated event; it maps back to the
 * plan already recorded in `platform_subscriptions.plan_id` and hits the no-op
 * guard, so the loop terminates.
 *
 * Provider-agnostic since #603: it takes a normalized `PortalPlanChangeInput`
 * and a `revertToPrice` callback rather than a `Stripe.Subscription` and a
 * Stripe client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { downgradeBlockedTemplate } from '@/lib/email/templates/downgrade-blocked'
import { countTenantUsage, computePlanLimitViolations } from '@/lib/billing/plan-limits'
import { reconcileAccessCutoff } from '@/lib/billing/access-cutoff'

/**
 * The plan-change-relevant slice of a provider subscription event, already
 * normalized (#603). Was a raw `Stripe.Subscription`, which made this module —
 * shared by every platform-billing provider — read one provider's payload shape.
 */
export interface PortalPlanChangeInput {
  /** Provider slug the subscription lives on. */
  provider: string
  tenantId?: string
  providerSubscriptionId?: string
  /** The price the subscription is NOW on — what the change is detected from. */
  providerPriceId?: string
  /** Billing cadence implied by that price, when the event reported one. */
  interval?: 'monthly' | 'yearly'
}

export interface PortalPlanChangeDeps {
  /** Service-role Supabase client (bypasses RLS). */
  admin: SupabaseClient
  /**
   * Put the subscription back on `providerPriceId` without proration — the
   * revert half of the over-limit downgrade guard.
   *
   * Supplied by the caller from the provider's own `updateSubscription`, and
   * only when `supportsPlanChange` says it exists. Omitted means there is no
   * way to move the subscription back, so the downgrade is applied to the DB
   * instead (consistency wins over enforcement) exactly as it always did when a
   * revert failed.
   */
  revertToPrice?: (providerSubscriptionId: string, providerPriceId: string) => Promise<void>
  /** Injectable for tests; defaults to the Mailgun sender. */
  sendEmailFn?: typeof sendEmail
}

export interface PortalPlanChangeResult {
  action: 'ignored' | 'noop' | 'applied' | 'reverted' | 'applied_over_limit'
  reason?: string
}

interface PlanRow {
  plan_id: string
  slug: string
  name: string | null
  transaction_fee_percent: number
  limits: { max_courses?: number; max_students?: number } | null
}

const PLAN_COLUMNS =
  'plan_id, slug, name, transaction_fee_percent, limits'

/**
 * Resolve a plan's price id on a given provider and interval from
 * `platform_plan_prices` (#601). Returns null when the plan has no active price
 * row for that combination.
 */
async function providerPriceIdFor(
  admin: SupabaseClient,
  planId: string,
  provider: string,
  interval: 'monthly' | 'yearly',
): Promise<string | null> {
  const { data } = (await admin
    .from('platform_plan_prices')
    .select('provider_price_id')
    .eq('plan_id', planId)
    .eq('payment_provider', provider)
    .eq('interval', interval)
    .eq('is_active', true)
    .maybeSingle()) as { data: { provider_price_id: string } | null }

  return data?.provider_price_id ?? null
}

export async function applyPortalPlanChange(
  input: PortalPlanChangeInput,
  { admin, revertToPrice, sendEmailFn = sendEmail }: PortalPlanChangeDeps
): Promise<PortalPlanChangeResult> {
  const { provider, tenantId, providerSubscriptionId } = input
  const newPriceId = input.providerPriceId

  if (!tenantId || !newPriceId) {
    return { action: 'ignored', reason: 'missing tenant_id or price on event' }
  }

  // The price -> plan mapping now lives in platform_plan_prices (#601), so the
  // lookup is a join through it rather than an OR across two plan columns.
  const { data: matchedPrice } = (await admin
    .from('platform_plan_prices')
    .select('plan_id')
    .eq('payment_provider', provider)
    .eq('provider_price_id', newPriceId)
    .maybeSingle()) as { data: { plan_id: string } | null }

  const { data: newPlan } = matchedPrice
    ? ((await admin
        .from('platform_plans')
        .select(PLAN_COLUMNS)
        .eq('plan_id', matchedPrice.plan_id)
        .maybeSingle()) as { data: PlanRow | null })
    : { data: null }

  if (!newPlan) {
    return { action: 'ignored', reason: `no platform plan matches price ${newPriceId}` }
  }

  const { data: currentSub } = (await admin
    .from('platform_subscriptions')
    .select('plan_id, interval, plan_override_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()) as {
    data: { plan_id: string; interval: string | null; plan_override_at: string | null } | null
  }

  // No-op guard: the incoming price maps to the plan already recorded. This is
  // also what terminates the webhook echo triggered by our own revert below.
  if (currentSub?.plan_id === newPlan.plan_id) {
    return { action: 'noop' }
  }

  // Override guard (#546 §3). A super admin has deliberately put this tenant on
  // a plan the provider knows nothing about, so its price and our plan_id are
  // SUPPOSED to disagree. Reconciling here would read the comp as a portal
  // downgrade and — because the tenant is typically over the real plan's limits,
  // which is why it was comped — push the subscription onto the comped plan's
  // price, billing the school for its own comp. A super admin lifts this with
  // clearTenantPlanOverride, and a real payment (confirmManualPayment /
  // changePlan) clears it automatically.
  if (currentSub?.plan_override_at) {
    return { action: 'ignored', reason: 'tenant plan is under a super-admin override' }
  }

  const maxCourses = newPlan.limits?.max_courses ?? -1
  const maxStudents = newPlan.limits?.max_students ?? -1

  // Shared with the pre-flight in-app check (lib/billing/plan-limits.ts) so the
  // reactive webhook path and the proactive path enforce identical limits.
  const violations =
    maxCourses !== -1 || maxStudents !== -1
      ? computePlanLimitViolations(await countTenantUsage(admin, tenantId), newPlan.limits)
      : []

  if (violations.length === 0) {
    await applyPlanToDb(admin, tenantId, newPlan)
    // Clears any cutoff scheduled from a prior over-limit period.
    await reconcileAccessCutoff(admin, tenantId)
    return { action: 'applied' }
  }

  const reasons = violations.map((v) =>
    v.resource === 'courses'
      ? `${v.current} active courses exceed the ${newPlan.name || newPlan.slug} limit of ${v.max}`
      : `${v.current} active students exceed the ${newPlan.name || newPlan.slug} limit of ${v.max}`
  )

  const { data: oldPlan } = currentSub?.plan_id
    ? ((await admin
        .from('platform_plans')
        .select(PLAN_COLUMNS)
        .eq('plan_id', currentSub.plan_id)
        .maybeSingle()) as { data: PlanRow | null })
    : { data: null }

  // Revert to the old plan's price on the subscription's billing interval,
  // falling back to whichever price the old plan actually has.
  const preferYearly = currentSub?.interval === 'yearly' || input.interval === 'yearly'
  const oldPriceId = oldPlan
    ? (await providerPriceIdFor(admin, oldPlan.plan_id, provider, preferYearly ? 'yearly' : 'monthly')) ||
      (await providerPriceIdFor(admin, oldPlan.plan_id, provider, preferYearly ? 'monthly' : 'yearly'))
    : null

  if (oldPriceId && providerSubscriptionId && revertToPrice) {
    try {
      await revertToPrice(providerSubscriptionId, oldPriceId)
      await notifyAdmins(admin, sendEmailFn, {
        tenantId,
        outcome: 'reverted',
        oldPlanName: oldPlan?.name || oldPlan?.slug || 'your current plan',
        newPlanName: newPlan.name || newPlan.slug,
        reasons,
      })
      console.error(
        `Plan downgrade reverted for tenant ${tenantId}: ${reasons.join('; ')}`
      )
      return { action: 'reverted' }
    } catch (err) {
      console.error(`Failed to revert ${provider} subscription for tenant ${tenantId}:`, err)
      // Fall through: if we cannot put the provider back, the DB follows it.
    }
  }

  await applyPlanToDb(admin, tenantId, newPlan)
  // Schedules a cutoff if the tenant is still over the new plan's limits.
  await reconcileAccessCutoff(admin, tenantId, { sendEmailFn })
  await notifyAdmins(admin, sendEmailFn, {
    tenantId,
    outcome: 'applied_over_limit',
    oldPlanName: oldPlan?.name || oldPlan?.slug || 'your previous plan',
    newPlanName: newPlan.name || newPlan.slug,
    reasons,
  })
  console.error(
    `Plan downgrade applied over limits for tenant ${tenantId}: ${reasons.join('; ')}`
  )
  return { action: 'applied_over_limit' }
}

async function applyPlanToDb(admin: SupabaseClient, tenantId: string, plan: PlanRow) {
  await admin
    .from('tenants')
    .update({ plan: plan.slug, updated_at: new Date().toISOString() })
    .eq('id', tenantId)

  await admin
    .from('platform_subscriptions')
    .update({ plan_id: plan.plan_id, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)

  await admin.from('revenue_splits').upsert(
    {
      tenant_id: tenantId,
      platform_percentage: plan.transaction_fee_percent,
      school_percentage: 100 - plan.transaction_fee_percent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' }
  )
}

/**
 * Best-effort admin notification: one `notifications` row + `user_notifications`
 * fan-out to every active tenant admin, plus a Mailgun email per admin. Never
 * throws — notification failure must not fail the webhook.
 */
async function notifyAdmins(
  admin: SupabaseClient,
  sendEmailFn: typeof sendEmail,
  params: {
    tenantId: string
    outcome: 'reverted' | 'applied_over_limit'
    oldPlanName: string
    newPlanName: string
    reasons: string[]
  }
) {
  const { tenantId, outcome, oldPlanName, newPlanName, reasons } = params
  try {
    const [{ data: tenantRow }, { data: adminUsers }] = await Promise.all([
      admin.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
      admin
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .eq('status', 'active'),
    ])

    const adminIds: string[] = (adminUsers || []).map((u: { user_id: string }) => u.user_id)
    if (adminIds.length === 0) return

    const title =
      outcome === 'reverted' ? 'Plan downgrade could not be completed' : 'School is over plan limits'
    const content =
      outcome === 'reverted'
        ? `Your downgrade to ${newPlanName} was reverted because your school exceeds its limits: ${reasons.join('; ')}. You remain on ${oldPlanName}.`
        : `Your school was downgraded to ${newPlanName} but exceeds its limits: ${reasons.join('; ')}. Please reduce usage or upgrade.`

    const { data: notification } = await admin
      .from('notifications')
      .insert({
        title,
        content,
        notification_type: 'warning',
        priority: 'high',
        target_type: 'user',
        target_user_ids: adminIds,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: adminIds[0],
        tenant_id: tenantId,
      })
      .select('id')
      .single()

    if (notification) {
      await admin
        .from('user_notifications')
        .insert(adminIds.map((userId) => ({ notification_id: notification.id, user_id: userId })))
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
    const template = downgradeBlockedTemplate({
      schoolName: tenantRow?.name || 'your school',
      oldPlanName,
      newPlanName,
      reasons,
      outcome,
      billingUrl: `${appUrl}/dashboard/admin/billing`,
    })

    for (const userId of adminIds) {
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      if (authUser?.user?.email) {
        await sendEmailFn({ to: authUser.user.email, ...template })
      }
    }
  } catch (err) {
    console.error('Failed to notify admins about plan downgrade:', err)
  }
}
