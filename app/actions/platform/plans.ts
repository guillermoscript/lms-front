'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import {
  PLAN_PRICE_CURRENCIES,
  PLAN_PRICE_INTERVALS,
  PLAN_PRICE_PROVIDERS,
  type PlanPriceCurrency,
  type PlanPriceInterval,
  type PlanPriceProvider,
} from '@/lib/billing/plan-prices'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { failPlatformSubscriptionSwitch } from '@/lib/billing/platform-subscription-switch'

async function verifySuperAdmin() {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')
  return userId
}

export async function getAllPlatformPlans() {
  await verifySuperAdmin()
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('platform_plans')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error('Failed to fetch plans')
  return data || []
}

export async function updatePlatformPlan(
  planId: string,
  updates: {
    name?: string
    price_monthly?: number
    price_yearly?: number
    transaction_fee_percent?: number
    limits?: Record<string, unknown>
    features?: Record<string, unknown>
    is_active?: boolean
    sort_order?: number
  }
) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('platform_plans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('plan_id', planId)

  if (error) throw new Error(`Failed to update plan: ${error.message}`)
  revalidatePath('/platform/plans')
  return { success: true }
}

export async function createPlatformPlan(data: {
  name: string
  slug: string
  price_monthly: number
  price_yearly: number
  transaction_fee_percent: number
  limits: Record<string, unknown>
  features: Record<string, unknown>
  sort_order?: number
}) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('platform_plans')
    .insert({ ...data, is_active: true })

  if (error) throw new Error(`Failed to create plan: ${error.message}`)
  revalidatePath('/platform/plans')
  return { success: true }
}

/**
 * Set (or clear) what a plan costs on one provider, for one interval — the
 * write that #602 says has never existed anywhere in the repo.
 *
 * Upserts on the table's own `(plan_id, payment_provider, interval)` unique
 * constraint, so re-saving a combination corrects it rather than failing; that
 * is what a super admin fixing a mistyped Stripe price id actually wants.
 *
 * Every enum-ish field is validated here rather than left to the CHECK
 * constraints. A rejected CHECK surfaces as an opaque Postgres error string in
 * a toast; validating first means the caller gets told which field is wrong.
 * The lists come from `lib/billing/plan-prices.ts`, which mirrors the
 * migration — so this accepts everything the database accepts, including
 * providers the editor's own dropdown does not yet offer.
 */
export async function upsertPlatformPlanPrice(input: {
  planId: string
  paymentProvider: string
  interval: string
  providerPriceId: string | null
  currency?: string
  amount?: number | null
  isActive?: boolean
}) {
  await verifySuperAdmin()

  const provider = input.paymentProvider as PlanPriceProvider
  if (!PLAN_PRICE_PROVIDERS.includes(provider)) {
    throw new Error(`Unknown payment provider: ${input.paymentProvider}`)
  }

  const interval = input.interval as PlanPriceInterval
  if (!PLAN_PRICE_INTERVALS.includes(interval)) {
    throw new Error(`Interval must be monthly or yearly, got: ${input.interval}`)
  }

  const currency = (input.currency ?? 'usd') as PlanPriceCurrency
  if (!PLAN_PRICE_CURRENCIES.includes(currency)) {
    throw new Error(`Unsupported currency: ${input.currency}`)
  }

  // Required only where a remote catalog exists to hold it. Binance Pay and
  // Solana have none (`createsCatalog: false`), so there is no id to paste and
  // demanding one would only produce placeholders — the exact failure mode #602
  // was filed for. A whitespace-only id is nothing either way.
  const providerPriceId = (input.providerPriceId ?? '').trim() || null
  const needsCatalogId = PROVIDER_CAPABILITIES[provider as PaymentProvider]?.createsCatalog !== false
  if (!providerPriceId && needsCatalogId) {
    throw new Error('Provider price ID is required')
  }

  // `amount` is nullable on purpose (the migration's own note): on a non-USD
  // rail the provider may charge something that is not `platform_plans.price_*`,
  // and where it does match there is nothing to record. A negative or NaN
  // amount is a typo either way.
  //
  // A catalog-less rail is the exception: with no price id at the provider,
  // this column is the only thing that says what the school is charged, and a
  // checkout falls back to the plan's list price without it.
  const amount = input.amount ?? null
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error('Amount must be a positive number, or left blank')
  }

  const adminClient = createAdminClient()

  const { data: plan } = await adminClient
    .from('platform_plans')
    .select('plan_id')
    .eq('plan_id', input.planId)
    .maybeSingle()
  if (!plan) throw new Error('Plan not found')

  const { error } = await adminClient.from('platform_plan_prices').upsert(
    {
      plan_id: input.planId,
      payment_provider: provider,
      interval,
      provider_price_id: providerPriceId,
      currency,
      amount,
      is_active: input.isActive ?? true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'plan_id,payment_provider,interval' }
  )

  if (error) throw new Error(`Failed to save plan price: ${error.message}`)
  revalidatePath('/platform/plans')
  revalidatePath('/platform/billing-health')
  return { success: true }
}

/**
 * Remove a provider price outright. Deactivating (`is_active = false`) is the
 * safer everyday move and is what the editor's toggle does; this is for a row
 * created against the wrong plan, where leaving it inactive just clutters the
 * dialog forever.
 */
export async function deletePlatformPlanPrice(priceId: string) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('platform_plan_prices')
    .delete()
    .eq('price_id', priceId)

  if (error) throw new Error(`Failed to delete plan price: ${error.message}`)
  revalidatePath('/platform/plans')
  revalidatePath('/platform/billing-health')
  return { success: true }
}

export async function togglePlanActive(planId: string, isActive: boolean) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  // Prevent deactivating a plan that has active subscribers
  if (!isActive) {
    const { count } = await adminClient
      .from('platform_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('plan_id', planId)
      .eq('status', 'active')

    if ((count ?? 0) > 0) {
      throw new Error(`Cannot deactivate: ${count} active subscriber(s) on this plan`)
    }
  }

  const { error } = await adminClient
    .from('platform_plans')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('plan_id', planId)

  if (error) throw new Error(`Failed to update plan: ${error.message}`)
  revalidatePath('/platform/plans')
  return { success: true }
}

/**
 * A request that has already reached its end state. Rejecting one of these is
 * never a status change — it is a contradiction of whatever the previous
 * decision already caused.
 */
const TERMINAL_REQUEST_STATUSES = ['confirmed', 'rejected', 'expired'] as const

/**
 * Super admin: refuse a manual payment request.
 *
 * Refusal only — a *reversal* is a different action (#615). Rejecting an
 * already-confirmed request used to flip the row to `rejected` while
 * `confirmManualPayment`'s effects stood: the tenant kept the plan, the
 * platform subscription stayed `active`, and `revenue_splits` kept the paid
 * plan's fee. The plan surviving is the safe direction, but the record then
 * said the school's payment was refused while the school was still being
 * served on it — a contradiction on the row money reconciliation reads.
 *
 * The page only renders Confirm/Reject for non-terminal rows
 * (`platform/billing/page.tsx`), so this is not reachable by clicking through a
 * fresh render. It is reachable from a stale one — two tabs on the same pending
 * row, confirm in the first, reject in the second — and a server action is a
 * POST endpoint regardless of what the UI chooses to draw. `confirmManualPayment`
 * and `sendPaymentInstructions` both read-then-check for the same reason; this
 * was the one write that didn't.
 *
 * The reason goes to `admin_notes`, not `notes`: `notes` carries the note the
 * school attached when it filed the request, and overwriting it destroyed the
 * school's side of the record.
 */
export async function rejectManualPayment(requestId: string, reason: string) {
  await verifySuperAdmin()

  const adminClient = createAdminClient()

  const { data: request } = await adminClient
    .from('platform_payment_requests')
    .select('request_id, status, switch_id')
    .eq('request_id', requestId)
    .maybeSingle()

  if (!request) throw new Error('Request not found')
  if (TERMINAL_REQUEST_STATUSES.includes(request.status as (typeof TERMINAL_REQUEST_STATUSES)[number])) {
    throw new Error(
      request.status === 'confirmed'
        ? 'This payment was already confirmed and the plan is active — it cannot be rejected. Change the plan directly if the payment needs undoing.'
        : `Request is already ${request.status}`
    )
  }

  // The status filter repeats the check inside the write. The read above exists
  // for the error message; this is what actually makes the guard hold when a
  // confirm lands between the two — which is precisely the two-tab race that
  // makes this reachable at all. `select` lets us tell "nothing matched" apart
  // from a real failure.
  const { data: updated, error } = await adminClient
    .from('platform_payment_requests')
    .update({
      status: 'rejected',
      admin_notes: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    .not('status', 'in', `(${TERMINAL_REQUEST_STATUSES.join(',')})`)
    .select('request_id')

  if (error) throw new Error(`Failed to reject request: ${error.message}`)
  if (!updated || updated.length === 0) {
    throw new Error('This request was decided by someone else just now — reload the page.')
  }

  await failPlatformSubscriptionSwitch(
    adminClient,
    request.switch_id,
    `Manual payment request rejected: ${reason}`,
  )

  revalidatePath('/platform/billing')
  return { success: true }
}

/**
 * Super admin: mark bank-transfer instructions as sent for a manual payment
 * request. Moves it `pending → instructions_sent` and notifies the tenant's
 * admins in-app so the dead intermediate state is actually reachable.
 */
export async function sendPaymentInstructions(requestId: string) {
  const userId = await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { data: request } = await adminClient
    .from('platform_payment_requests')
    .select('request_id, tenant_id, status')
    .eq('request_id', requestId)
    .single()

  if (!request) throw new Error('Request not found')
  if (request.status !== 'pending') {
    throw new Error('Instructions can only be sent for pending requests')
  }

  await adminClient
    .from('platform_payment_requests')
    .update({ status: 'instructions_sent', updated_at: new Date().toISOString() })
    .eq('request_id', requestId)

  // Best-effort in-app notification to the tenant's admins — never block the
  // status change on a notification failure.
  try {
    const { data: adminUsers } = await adminClient
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', request.tenant_id)
      .eq('role', 'admin')
      .eq('status', 'active')

    const adminIds = (adminUsers || []).map((u: { user_id: string }) => u.user_id)
    if (adminIds.length > 0) {
      const { data: notification } = await adminClient
        .from('notifications')
        .insert({
          title: 'Bank transfer instructions sent',
          content:
            'Bank transfer instructions for your plan payment are on the way. Check your email, complete the transfer, then upload your proof of payment from the billing page.',
          notification_type: 'info',
          priority: 'normal',
          target_type: 'user',
          target_user_ids: adminIds,
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_by: userId,
          tenant_id: request.tenant_id,
        })
        .select('id')
        .single()

      if (notification) {
        await adminClient
          .from('user_notifications')
          .insert(adminIds.map((uid) => ({ notification_id: notification.id, user_id: uid })))
      }
    }
  } catch (err) {
    console.error('Failed to notify tenant admins about payment instructions:', err)
  }

  revalidatePath('/platform/billing')
  return { success: true }
}

/**
 * Super admin: force a tenant onto a plan without any payment.
 *
 * This never calls Stripe, so a tenant with a live Stripe subscription keeps
 * paying for the plan it actually bought while enjoying the comped one. The
 * override is stamped on the subscription row (#546 §3) so
 * `applyPortalPlanChange` can recognise the deliberate divergence and leave the
 * Stripe subscription alone — without the stamp the next
 * `customer.subscription.updated` read Stripe's real (unchanged) price as a
 * downgrade, found the tenant over the real plan's limits (the reason it was
 * comped) and "reverted" Stripe onto the comped plan's price, billing the
 * school for its own comp.
 *
 * Exits: `confirmManualPayment`, `changePlan`, or `clearTenantPlanOverride`.
 */
export async function forceTenantPlanChange(tenantId: string, planSlug: string) {
  const superAdminId = await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { data: plan } = await adminClient
    .from('platform_plans')
    .select('plan_id, slug, transaction_fee_percent')
    .eq('slug', planSlug)
    .single()

  if (!plan) throw new Error('Plan not found')

  const nowIso = new Date().toISOString()

  await adminClient
    .from('tenants')
    .update({ plan: planSlug, updated_at: nowIso })
    .eq('id', tenantId)

  // Update revenue split
  await adminClient
    .from('revenue_splits')
    .upsert({
      tenant_id: tenantId,
      platform_percentage: plan.transaction_fee_percent,
      school_percentage: 100 - plan.transaction_fee_percent,
      updated_at: nowIso,
    }, { onConflict: 'tenant_id' })

  // Keep platform_subscriptions in sync with the forced plan (issue #468).
  // Previously this action changed tenants.plan + the split but left the
  // subscription row pointing at the old plan, so the two disagreed after an
  // override.
  const { data: existingSub } = await adminClient
    .from('platform_subscriptions')
    .select('subscription_id, status, current_period_end')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (planSlug === 'free') {
    // Free needs no active subscription — cancel any existing row so the
    // subscription and the tenant's plan agree.
    if (existingSub) {
      await adminClient
        .from('platform_subscriptions')
        .update({
          plan_id: plan.plan_id,
          status: 'canceled',
          canceled_at: nowIso,
          plan_override_by: superAdminId,
          plan_override_at: nowIso,
          updated_at: nowIso,
        })
        .eq('tenant_id', tenantId)
    }
  } else if (existingSub) {
    // Point the existing subscription at the forced plan. Preserve the billing
    // period only when the sub is on a live paid cycle (active with a future
    // period end); otherwise — canceled/expired row, or a lapsed period —
    // reactivating with the stale current_period_end would hand the row
    // straight to the expire-platform-subscriptions cron (past_due, then
    // auto-downgrade after grace), silently undoing the override. Clear the
    // period instead so the override is indefinite, like the insert below.
    const liveCycle =
      existingSub.status === 'active' &&
      existingSub.current_period_end != null &&
      new Date(existingSub.current_period_end) > new Date()
    await adminClient
      .from('platform_subscriptions')
      .update({
        plan_id: plan.plan_id,
        status: 'active',
        plan_override_by: superAdminId,
        plan_override_at: nowIso,
        updated_at: nowIso,
        ...(liveCycle
          ? {}
          : {
              current_period_end: null,
              grace_period_end: null,
              cancel_at_period_end: false,
              canceled_at: null,
            }),
      })
      .eq('tenant_id', tenantId)
  } else {
    // No subscription yet (e.g. tenant was on free): create a manual override
    // row so the paid plan is backed by an active subscription.
    //
    // current_period_end stays NULL on purpose: a super-admin override is
    // indefinite, not a one-month grant. The expire-platform-subscriptions
    // cron filters every phase on `.not('current_period_end', 'is', null)`,
    // so a NULL period end is never reminded, never lapses to past_due, and
    // never auto-downgrades — the override holds until a super admin changes
    // it again or the school starts paying (confirmManualPayment then upserts
    // a real dated cycle over this row).
    await adminClient
      .from('platform_subscriptions')
      .insert({
        tenant_id: tenantId,
        plan_id: plan.plan_id,
        status: 'active',
        payment_provider: 'manual',
        interval: 'monthly',
        current_period_start: nowIso,
        current_period_end: null,
        plan_override_by: superAdminId,
        plan_override_at: nowIso,
      })
  }

  revalidatePath('/platform/tenants')
  return { success: true }
}

/**
 * Super admin: end a plan override so portal-driven Stripe changes sync again
 * (#546 §3). The marker's explicit exit — without one, a comped tenant would be
 * frozen out of `applyPortalPlanChange` forever, which is the failure mode the
 * issue flags as the risk of adding the marker at all.
 *
 * The tenant keeps whatever plan it is on; only the "ignore portal changes"
 * behaviour is lifted, so the next `customer.subscription.updated` reconciles
 * the DB back onto whatever Stripe is actually charging.
 */
export async function clearTenantPlanOverride(tenantId: string) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('platform_subscriptions')
    .update({
      plan_override_by: null,
      plan_override_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`Failed to clear plan override: ${error.message}`)
  revalidatePath('/platform/tenants')
  return { success: true }
}

export async function suspendTenant(tenantId: string, suspend: boolean) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('tenants')
    .update({
      status: suspend ? 'suspended' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId)

  if (error) throw new Error(`Failed to update tenant: ${error.message}`)
  revalidatePath('/platform/tenants')
  return { success: true }
}
