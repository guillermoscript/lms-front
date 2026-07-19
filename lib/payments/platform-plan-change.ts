/**
 * Portal plan-change handler for the platform (school → platform) billing
 * webhook.
 *
 * Applies a `customer.subscription.updated` price change from the Stripe
 * Customer Portal to our plan state (`tenants.plan`,
 * `platform_subscriptions.plan_id`, `revenue_splits`), enforcing the target
 * plan's course/student limits on downgrades.
 *
 * Invariant this module exists to protect: the Stripe subscription price and
 * the DB plan may NEVER disagree after the webhook returns. A downgrade that
 * exceeds the target plan's limits is REVERTED on Stripe (back to the old
 * plan's price, no proration) and school admins are notified; if the revert
 * is impossible (old plan has no Stripe price) or fails, the downgrade is
 * applied to the DB instead — consistency wins over enforcement — and admins
 * are warned they are over the new plan's limits.
 *
 * The revert triggers an echo `customer.subscription.updated` event; it maps
 * back to the plan already recorded in `platform_subscriptions.plan_id` and
 * hits the no-op guard, so the loop terminates.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { downgradeBlockedTemplate } from '@/lib/email/templates/downgrade-blocked'

export interface PortalPlanChangeDeps {
  /** Service-role Supabase client (bypasses RLS). */
  admin: SupabaseClient
  /** Platform Stripe client — only `subscriptions.update` is used. */
  stripe: {
    subscriptions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: (id: string, params: any) => Promise<any>
    }
  }
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
  stripe_price_id_monthly: string | null
  stripe_price_id_yearly: string | null
}

const PLAN_COLUMNS =
  'plan_id, slug, name, transaction_fee_percent, limits, stripe_price_id_monthly, stripe_price_id_yearly'

export async function applyPortalPlanChange(
  // Stripe.Subscription with 2026-02-25.clover typing quirks — treated as any
  // like the rest of the webhook.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscription: any,
  { admin, stripe, sendEmailFn = sendEmail }: PortalPlanChangeDeps
): Promise<PortalPlanChangeResult> {
  const tenantId = subscription?.metadata?.tenant_id as string | undefined
  const item = subscription?.items?.data?.[0]
  const newPriceId = item?.price?.id as string | undefined

  if (!tenantId || !newPriceId) {
    return { action: 'ignored', reason: 'missing tenant_id or price on event' }
  }

  const { data: newPlan } = (await admin
    .from('platform_plans')
    .select(PLAN_COLUMNS)
    .or(`stripe_price_id_monthly.eq.${newPriceId},stripe_price_id_yearly.eq.${newPriceId}`)
    .maybeSingle()) as { data: PlanRow | null }

  if (!newPlan) {
    return { action: 'ignored', reason: `no platform plan matches price ${newPriceId}` }
  }

  const { data: currentSub } = (await admin
    .from('platform_subscriptions')
    .select('plan_id, interval')
    .eq('tenant_id', tenantId)
    .maybeSingle()) as { data: { plan_id: string; interval: string | null } | null }

  // No-op guard: the incoming price maps to the plan already recorded. This is
  // also what terminates the webhook echo triggered by our own revert below.
  if (currentSub?.plan_id === newPlan.plan_id) {
    return { action: 'noop' }
  }

  const maxCourses = newPlan.limits?.max_courses ?? -1
  const maxStudents = newPlan.limits?.max_students ?? -1

  let overCourses = false
  let overStudents = false
  let courseCount = 0
  let studentCount = 0

  if (maxCourses !== -1 || maxStudents !== -1) {
    const [coursesRes, studentsRes] = await Promise.all([
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
    courseCount = coursesRes.count ?? 0
    studentCount = studentsRes.count ?? 0
    overCourses = maxCourses !== -1 && courseCount > maxCourses
    overStudents = maxStudents !== -1 && studentCount > maxStudents
  }

  if (!overCourses && !overStudents) {
    await applyPlanToDb(admin, tenantId, newPlan)
    return { action: 'applied' }
  }

  const reasons: string[] = []
  if (overCourses) {
    reasons.push(`${courseCount} active courses exceed the ${newPlan.name || newPlan.slug} limit of ${maxCourses}`)
  }
  if (overStudents) {
    reasons.push(`${studentCount} active students exceed the ${newPlan.name || newPlan.slug} limit of ${maxStudents}`)
  }

  const { data: oldPlan } = currentSub?.plan_id
    ? ((await admin
        .from('platform_plans')
        .select(PLAN_COLUMNS)
        .eq('plan_id', currentSub.plan_id)
        .maybeSingle()) as { data: PlanRow | null })
    : { data: null }

  // Revert to the old plan's price on the subscription's billing interval,
  // falling back to whichever price the old plan actually has.
  const preferYearly =
    currentSub?.interval === 'yearly' || item?.price?.recurring?.interval === 'year'
  const oldPriceId = preferYearly
    ? oldPlan?.stripe_price_id_yearly || oldPlan?.stripe_price_id_monthly
    : oldPlan?.stripe_price_id_monthly || oldPlan?.stripe_price_id_yearly

  if (oldPriceId && item?.id) {
    try {
      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: oldPriceId }],
        proration_behavior: 'none',
      })
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
      console.error(`Failed to revert Stripe subscription for tenant ${tenantId}:`, err)
      // Fall through: if we cannot put Stripe back, the DB follows Stripe.
    }
  }

  await applyPlanToDb(admin, tenantId, newPlan)
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
