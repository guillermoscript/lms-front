'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { checkPlanLimits, countTenantUsage, formatPlanLimitError } from '@/lib/billing/plan-limits'
import { classifyPlanChange } from '@/lib/billing/plan-change'
import { PLAN_PRICE_PROVIDERS, type PlanPriceProvider } from '@/lib/billing/plan-prices'
import { reconcileAccessCutoff, reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { getPaymentProvider } from '@/lib/payments'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import {
  OPEN_REQUEST_STATUSES,
  hasOpenPaymentRequest,
  requestExpiresAt,
} from '@/lib/billing/payment-request-ttl'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import { revalidatePath } from 'next/cache'
import {
  SwitchAlreadyPendingError,
  beginPlatformSubscriptionSwitch,
  failPlatformSubscriptionSwitch,
  reconcilePlatformSubscriptionSwitch,
} from '@/lib/billing/platform-subscription-switch'

async function verifyAdminAccess() {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')

  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!membership || membership.role !== 'admin') {
    throw new Error('Only school admins can manage billing')
  }

  return { userId, tenantId, supabase }
}

/**
 * Get current subscription status and usage statistics
 */
export async function getSubscriptionStatus() {
  const { tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Fetch tenant, subscription, plan, and usage in parallel.
  // Usage goes through countTenantUsage (#546 §5) so the number an admin reads
  // here is the same number the downgrade pre-flight and course-creation
  // enforcement compare against — it used to count archived courses that
  // neither of those did.
  const [tenantResult, subscriptionResult, billingCustomerResult, usage] = await Promise.all([
    adminClient
      .from('tenants')
      .select('plan, billing_status, billing_period_end, billing_email, access_cutoff_at')
      .eq('id', tenantId)
      .single(),
    adminClient
      .from('platform_subscriptions')
      .select('*, platform_plans(*)')
      .eq('tenant_id', tenantId)
      .single(),
    // The customer id now lives per-provider in tenant_billing_customers (#601).
    // Read every provider's row rather than Stripe's: which one matters depends
    // on the subscription's own provider, which is resolved below (#604).
    adminClient
      .from('tenant_billing_customers')
      .select('provider_customer_id, payment_provider')
      .eq('tenant_id', tenantId),
    countTenantUsage(adminClient, tenantId),
  ])

  const tenant = tenantResult.data
  const subscription = subscriptionResult.data
  const planSlug = tenant?.plan || 'free'

  // Whether to offer a "manage billing" button is a provider ABILITY, not a
  // question of whether a Stripe customer row happens to exist (#604). A school
  // on a provider with no hosted portal must not be shown a button that opens
  // nothing — the in-app cancel / reactivate / change-plan controls are its
  // management surface instead.
  const subscriptionProvider = subscription?.payment_provider as PaymentProvider | undefined
  const canUseCustomerPortal =
    !!subscriptionProvider &&
    !!PROVIDER_CAPABILITIES[subscriptionProvider]?.supportsCustomerPortal &&
    !!(
      subscription?.provider_customer_id ||
      (billingCustomerResult.data ?? []).find(
        (c) => c.payment_provider === subscriptionProvider && c.provider_customer_id
      )
    )

  // Get plan details
  const { data: planDetails } = await adminClient
    .from('platform_plans')
    .select('*')
    .eq('slug', planSlug)
    .single()

  const limits = planDetails?.limits as { max_courses: number; max_students: number } || { max_courses: 5, max_students: 50 }
  const nextPaymentDate = subscription?.current_period_end || tenant?.billing_period_end || null
  const nextPaymentAmount = subscription && planDetails
    ? subscription.interval === 'yearly' ? planDetails.price_yearly : planDetails.price_monthly
    : null

  return {
    plan: planSlug,
    planName: planDetails?.name || 'Free',
    billingStatus: tenant?.billing_status || 'free',
    billingPeriodEnd: tenant?.billing_period_end,
    billingEmail: tenant?.billing_email,
    canUseCustomerPortal,
    accessCutoffAt: tenant?.access_cutoff_at ?? null,
    subscription: subscription ? {
      status: subscription.status,
      // Named for the column it carries (#602). While this was `paymentMethod`
      // its readers compared it against `'manual_transfer'`, which #601 folded
      // into `'manual'` — so every bank-transfer school was rendered as a card
      // payer and lost its manual-renewal UI.
      paymentProvider: subscription.payment_provider,
      interval: subscription.interval,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      gracePeriodEnd: subscription.grace_period_end,
    } : null,
    upcomingPayment: nextPaymentDate && nextPaymentAmount !== null && planSlug !== 'free' ? {
      amount: nextPaymentAmount,
      currency: 'USD',
      dueDate: nextPaymentDate,
      paymentProvider: subscription?.payment_provider || null,
    } : null,
    usage: {
      courses: {
        current: usage.courses,
        limit: limits.max_courses,
      },
      students: {
        current: usage.students,
        limit: limits.max_students,
      },
    },
    features: planDetails?.features || {},
    // `??`, never `||` (#613). Business and Enterprise carry a genuine 0% fee,
    // and `0 || 10` is 10 — so the two plans whose zero fee is the reason to buy
    // them were the only two told they pay the Free-plan rate. The 10 here is
    // the fallback for a tenant whose `plan` slug matches no platform_plans row,
    // which is the only case it was ever meant to cover.
    transactionFeePercent: planDetails?.transaction_fee_percent ?? 10,
  }
}

/**
 * Get all available platform plans
 */
export async function getAvailablePlans() {
  const adminClient = await createAdminClient()

  const { data: plans } = await adminClient
    .from('platform_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return plans || []
}

/**
 * Request a plan upgrade via manual bank transfer
 */
/**
 * Open an out-of-band settlement request for a platform plan.
 *
 * `paymentProvider` names the rail the school will actually settle on — a bank
 * wire (`manual`, the default and what every request was before #603), or any
 * other provider the school can reach but we cannot charge automatically. It is
 * copied onto the subscription when a super admin confirms the payment, so the
 * billing screens stop calling a USDT transfer a bank transfer.
 */
export async function requestManualPlanUpgrade(
  planId: string,
  interval: 'monthly' | 'yearly' = 'monthly',
  bankReference?: string,
  notes?: string,
  paymentProvider: string = 'manual',
) {
  const { userId, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  if (!PLAN_PRICE_PROVIDERS.includes(paymentProvider as PlanPriceProvider)) {
    throw new Error('Unknown payment method')
  }

  // Get plan details
  const { data: plan } = await adminClient
    .from('platform_plans')
    .select('*')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .single()

  if (!plan) throw new Error('Plan not found')
  if (plan.slug === 'free') throw new Error('Cannot request a change to the free plan')

  const amount = interval === 'yearly' ? plan.price_yearly : plan.price_monthly

  // Derive a real request_type (upgrade vs downgrade) by comparing against the
  // tenant's current plan, instead of the old hardcoded 'upgrade'.
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single()
  const currentSlug = tenant?.plan || 'free'
  const { data: currentPlan } = await adminClient
    .from('platform_plans')
    .select('sort_order, price_monthly, price_yearly')
    .eq('slug', currentSlug)
    .maybeSingle()
  const currentAmount = currentPlan
    ? interval === 'yearly'
      ? currentPlan.price_yearly
      : currentPlan.price_monthly
    : 0
  const { requestType } = classifyPlanChange({
    currentSortOrder: currentPlan?.sort_order ?? 0,
    currentAmount: Number(currentAmount) || 0,
    targetSortOrder: plan.sort_order ?? 0,
    targetAmount: Number(amount) || 0,
  })

  // Pre-flight limit check at request time — block an over-limit downgrade
  // request now, rather than surfacing it days later at super-admin confirm.
  const limitCheck = await checkPlanLimits(adminClient, tenantId, { planId })
  if (!limitCheck.ok) {
    throw new Error(formatPlanLimitError(limitCheck) || 'Plan limits exceeded')
  }

  // Check for an existing open request. Bounded list + array check, never
  // `.single()` (#546 §2): with two or more matching rows `.single()` returns
  // PGRST116 and `data: null`, so the guard PASSED and the table grew unbounded
  // per tenant. Lapsed requests are ignored so a stale row cannot lock a school
  // out of paying.
  if (await hasOpenPaymentRequest(adminClient, tenantId)) {
    throw new Error('You already have a pending plan change request. Please wait for it to be processed.')
  }

  const expiresAt = requestExpiresAt()
  let switchId: string | null
  try {
    switchId = await beginPlatformSubscriptionSwitch({
      admin: adminClient,
      tenantId,
      targetPlanId: planId,
      targetProvider: paymentProvider as PaymentProvider,
      targetInterval: interval,
      initiatedBy: userId,
      expiresAt,
    })
  } catch (switchError) {
    if (switchError instanceof SwitchAlreadyPendingError) throw switchError
    throw new Error('Failed to prepare payment-method switch')
  }

  const { data: request, error } = await adminClient
    .from('platform_payment_requests')
    .insert({
      tenant_id: tenantId,
      plan_id: planId,
      requested_by: userId,
      interval,
      amount,
      currency: 'usd',
      status: 'pending',
      request_type: requestType,
      payment_provider: paymentProvider,
      bank_reference: bankReference || null,
      notes: notes || null,
      expires_at: expiresAt,
      switch_id: switchId,
    })
    .select('request_id')
    .single()

  if (error) {
    await failPlatformSubscriptionSwitch(adminClient, switchId, error)
    console.error('Failed to create payment request:', error)
    throw new Error('Failed to create upgrade request')
  }

  return { requestId: request.request_id }
}

/**
 * Get pending manual payment requests for the current tenant
 */
export async function getManualPaymentRequests() {
  const { tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  const { data } = await adminClient
    .from('platform_payment_requests')
    .select('*, platform_plans(name, slug)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(10)

  return data || []
}

/**
 * Check if downgrading to a target plan would violate usage limits.
 * Returns null if OK, or an error message string if over limits.
 */
async function checkDowngradeLimits(
  adminClient: Awaited<ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>>,
  tenantId: string,
  targetPlanId: string,
): Promise<string | null> {
  const result = await checkPlanLimits(adminClient, tenantId, { planId: targetPlanId })
  return formatPlanLimitError(result)
}

/**
 * Super admin: confirm a manual bank transfer and activate the plan
 */
export async function confirmManualPayment(requestId: string) {
  const adminClient = await createAdminClient()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')

  // Verify super admin
  const { data: superAdmin } = await adminClient
    .from('super_admins')
    .select('user_id')
    .eq('user_id', userId)
    .single()

  if (!superAdmin) throw new Error('Only super admins can confirm payments')

  // Keep the user-friendly limit preflight outside the transaction. The RPC
  // repeats all security/state checks and owns every money-to-entitlement write.
  const { data: request, error: requestError } = await adminClient
    .from('platform_payment_requests')
    .select(
      'tenant_id, plan_id, status, payment_provider, amount, currency, interval, request_type, created_at, platform_plans(slug)'
    )
    .eq('request_id', requestId)
    .single()

  if (requestError || !request) throw new Error('Request not found')

  // Only the analytics event below reads this; every write is the RPC's.
  // PostgREST types a narrowed embed as an array even though the FK is to-one.
  const plan = (Array.isArray(request.platform_plans)
    ? request.platform_plans[0]
    : request.platform_plans) as { slug: string } | null

  // Check downgrade limits before activating
  if ((OPEN_REQUEST_STATUSES as readonly string[]).includes(request.status)) {
    const limitError = await checkDowngradeLimits(adminClient, request.tenant_id, request.plan_id)
    if (limitError) throw new Error(limitError)
  }

  const { data, error } = await adminClient.rpc('confirm_platform_payment_request', {
    _request_id: requestId,
    _confirmed_by: userId,
  })
  const confirmation = data?.[0]

  if (error) throw new Error(error.message || 'Failed to confirm payment')
  if (!confirmation) throw new Error('Failed to confirm payment')

  // Activation already passed the pre-flight limit check above, so this
  // clears any cutoff scheduled from a prior over-limit period.
  await reconcileAccessCutoffSafely(adminClient, confirmation.tenant_id)

  if (confirmation.switch_id) {
    try {
      await reconcilePlatformSubscriptionSwitch(adminClient, confirmation.switch_id)
    } catch (cleanupError) {
      // Promotion already committed. The durable switch ledger lets the cron
      // retry source cleanup; never report the paid activation itself as failed.
      console.error('[billing/switch] post-confirmation reconciliation failed:', cleanupError)
    }
  }

  revalidatePath('/[locale]/platform/billing', 'page')

  // Gated on `applied`, which the analytics side never had to think about:
  // before the RPC, a second confirmation threw "Already confirmed" and could
  // not reach this line. Replay is now an audited no-op, so an ungated event
  // would book the same platform payment into the revenue funnel twice.
  if (confirmation.applied) {
    // Loop E. Two deliberate attribution choices, both the same shape as the
    // student-side manual flow (Loop C trap 3):
    //
    //   - NO `userId` and NO `isSuperAdmin` in the context. This runs in a SUPER
    //     ADMIN's request, and `shouldDropEvent` drops anything flagged
    //     super-admin (§9.6) — passing it would silently delete every
    //     bank-transfer activation from the revenue funnel. The event belongs to
    //     the SCHOOL, so `tenantId` carries it and no profile is attached.
    //   - Backdated to when the school asked to pay, not to when a human got
    //     round to confirming it, so the revenue lands in the right period.
    //
    // `is_renewal` comes from the request's own `request_type`, which was
    // classified at request time — the same column the expiry cron's renewal
    // pause reads, so the two can never disagree.
    await track(
      ANALYTICS_EVENTS.PLATFORM_PAYMENT_SUCCEEDED,
      {
        provider: request.payment_provider || 'manual',
        amount: Number(request.amount ?? 0),
        interval: request.interval,
        is_renewal: request.request_type === 'renewal',
        currency: request.currency ?? 'usd',
        plan: plan?.slug ?? null,
        request_type: request.request_type ?? null,
        settlement_path: 'super_admin_confirm',
        requested_at: request.created_at,
        hours_to_confirm: request.created_at
          ? Math.round(((Date.now() - new Date(request.created_at).getTime()) / 3_600_000) * 10) / 10
          : null,
      },
      { tenantId: request.tenant_id, timestamp: request.created_at }
    )
  }

  return { success: true, applied: confirmation.applied }
}

/**
 * Load the pieces needed to modify an active platform subscription: the
 * provider it is billed through, its capabilities, and the target plan's price
 * on THAT provider. Throws a friendly Error for every non-actionable state (no
 * active sub, a provider with no in-place swap, free target, unconfigured
 * price).
 *
 * Deliberately no SDK here (#604): the caller drives the provider through
 * `IPaymentProvider`, so this stays the same shape for Stripe, Lemon Squeezy
 * and anything added later.
 */
async function resolvePlatformPlanChange(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  tenantId: string,
  planId: string,
  interval: 'monthly' | 'yearly',
) {
  // The embedded current plan is here for the analytics events in the two
  // callers: `plan_change_previewed` and `plan_changed` are only readable as a
  // funnel if both carry `from_plan`, and it is an embed on a query that was
  // already happening rather than a second round trip.
  const { data: sub } = await adminClient
    .from('platform_subscriptions')
    .select(
      'provider_subscription_id, provider_customer_id, payment_provider, status, current_period_end, plan_id, interval, platform_plans(slug, sort_order, price_monthly, price_yearly)',
    )
    .eq('tenant_id', tenantId)
    .single()

  if (!sub || sub.status !== 'active') {
    throw new Error('No active subscription to change')
  }

  const provider = sub.payment_provider as PaymentProvider
  const capabilities = PROVIDER_CAPABILITIES[provider]
  // Branch on the ABILITY to swap a live subscription in place, never on which
  // provider it happens to be (#604). Providers without one are not broken —
  // they change plan by starting a new checkout, which is where the upgrade
  // page already sends them.
  if (!capabilities?.supportsPlanChange || !sub.provider_subscription_id) {
    throw new Error(
      'Changing plan in place is not available for this payment method. Choose a payment method on the upgrade page to switch plans.'
    )
  }

  const { data: plan } = await adminClient
    .from('platform_plans')
    // `sort_order` + both prices are what `classifyPlanChange` needs to label
    // the move an upgrade or a downgrade the same way the request-type column
    // does; extra columns on a query that already runs, not a second read.
    .select('plan_id, slug, name, transaction_fee_percent, sort_order, price_monthly, price_yearly')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .single()

  if (!plan) throw new Error('Plan not found')
  if (plan.slug === 'free') {
    throw new Error('To move to the Free plan, cancel your subscription instead.')
  }

  // Price ids live per (plan, provider, interval) since #601.
  const { data: price } = await adminClient
    .from('platform_plan_prices')
    .select('provider_price_id')
    .eq('plan_id', planId)
    .eq('payment_provider', provider)
    .eq('interval', interval)
    .eq('is_active', true)
    .maybeSingle()

  const targetPriceId = price?.provider_price_id
  if (!targetPriceId) {
    throw new Error('A price is not configured for this plan on your payment method. Please contact support.')
  }

  // PostgREST types a to-one embed as a possible array; the FK makes it a row.
  const currentPlanEmbed = sub.platform_plans as unknown as CurrentPlanEmbed | CurrentPlanEmbed[] | null
  const currentPlan = (Array.isArray(currentPlanEmbed) ? currentPlanEmbed[0] : currentPlanEmbed) ?? null

  return {
    provider,
    capabilities,
    subId: sub.provider_subscription_id as string,
    customerId: (sub.provider_customer_id as string) || undefined,
    currentPeriodEnd: (sub.current_period_end as string | null) ?? null,
    currentInterval: (sub.interval as string | null) ?? null,
    currentPlan,
    targetPriceId: targetPriceId as string,
    plan,
  }
}

interface CurrentPlanEmbed {
  slug: string | null
  sort_order: number | null
  price_monthly: number | string | null
  price_yearly: number | string | null
}

/**
 * `from_plan` / `to_plan` / `is_upgrade` for the plan-change events, classified
 * with the SAME `classifyPlanChange` the request-type column uses — an analytics
 * "upgrade" that disagrees with the stored `request_type` would be worse than no
 * flag at all.
 */
function planChangeProperties(
  ctx: {
    currentPlan: CurrentPlanEmbed | null
    plan: { slug: string; name: string; sort_order?: number | null }
  },
  targetInterval: 'monthly' | 'yearly',
  targetAmount: number,
) {
  const currentAmount = Number(
    (targetInterval === 'yearly' ? ctx.currentPlan?.price_yearly : ctx.currentPlan?.price_monthly) ?? 0,
  )
  const { requestType, isIntervalOnly } = classifyPlanChange({
    currentSortOrder: ctx.currentPlan?.sort_order ?? 0,
    currentAmount: Number.isFinite(currentAmount) ? currentAmount : 0,
    targetSortOrder: ctx.plan.sort_order ?? 0,
    targetAmount,
  })
  return {
    from_plan: ctx.currentPlan?.slug ?? 'free',
    to_plan: ctx.plan.slug,
    is_upgrade: requestType === 'upgrade',
    is_interval_only: isIntervalOnly,
    interval: targetInterval,
  }
}

/**
 * Preview an in-app plan change for an active subscriber. Returns the blocking
 * limit violations (computed before any provider call) OR a proration quote so
 * the admin sees the credit/charge before confirming.
 *
 * Three distinct outcomes, because conflating them misleads the admin (#604):
 *  - `proration` set        → a real quote from the provider.
 *  - `noProration` set      → the provider cannot quote mid-period changes
 *                             (`supportsProrationPreview: false`). The change
 *                             is still valid; we say so honestly with the date
 *                             it takes effect rather than inventing a number.
 *  - both null              → the provider CAN quote but the call failed.
 *                             Best-effort: let the change proceed unquoted.
 */
export async function previewPlanChange(planId: string, interval: 'monthly' | 'yearly' = 'monthly') {
  const { userId, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Pre-flight limit check BEFORE any provider call.
  const limitCheck = await checkPlanLimits(adminClient, tenantId, { planId })
  if (!limitCheck.ok) {
    return { ok: false as const, violations: limitCheck.violations, planName: limitCheck.planName }
  }

  const ctx = await resolvePlatformPlanChange(adminClient, tenantId, planId, interval)

  const targetAmount = Number(
    (interval === 'yearly' ? ctx.plan.price_yearly : ctx.plan.price_monthly) ?? 0,
  )
  const changeProps = planChangeProperties(ctx, interval, targetAmount)

  // Loop E, the step between `upgrade_page_viewed` and `plan_changed`. Emitted
  // before the provider quote so a preview the provider fails to price is still
  // counted as intent — that gap is the interesting part of the funnel.
  await track(
    ANALYTICS_EVENTS.PLAN_CHANGE_PREVIEWED,
    {
      ...changeProps,
      provider: ctx.provider,
      amount: targetAmount,
      supports_proration_preview: !!ctx.capabilities.supportsProrationPreview,
    },
    { userId, tenantId, role: 'admin' },
  )

  if (!ctx.capabilities.supportsProrationPreview) {
    return {
      ok: true as const,
      proration: null,
      noProration: {
        effectiveAt: ctx.currentPeriodEnd,
        planName: ctx.plan.name,
      },
    }
  }

  try {
    const provider = getPaymentProvider(ctx.provider)
    if (!provider.previewSubscriptionChange) {
      throw new Error(`${ctx.provider} declares supportsProrationPreview but implements no preview`)
    }
    const preview = await provider.previewSubscriptionChange(ctx.subId, {
      newProviderPriceId: ctx.targetPriceId,
      providerCustomerId: ctx.customerId,
      prorationBehavior: 'create_prorations',
    })
    return {
      ok: true as const,
      proration: { ...preview, planName: ctx.plan.name },
    }
  } catch (err) {
    console.error('Failed to preview plan change:', err)
    // Preview is best-effort — allow the change to proceed without one.
    return { ok: true as const, proration: null }
  }
}

/**
 * Apply an in-app plan change (upgrade / downgrade / interval switch) for an
 * active subscriber on a provider that can swap the plan in place, replacing
 * the old "use the Stripe portal" punt.
 *
 * Order matters: the pre-flight limit check and the provider update run BEFORE
 * any DB write, so an over-limit downgrade is blocked with actionable messaging
 * and our plan state only ever moves after the provider confirms (the #461
 * invariant — the provider's price and our DB plan may never disagree). The
 * subsequent optimistic DB mirror lets the webhook echo (applyPortalPlanChange)
 * hit its no-op guard.
 */
export async function changePlan(planId: string, interval: 'monthly' | 'yearly' = 'monthly') {
  const { userId, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Pre-flight limit check BEFORE touching the provider.
  const limitCheck = await checkPlanLimits(adminClient, tenantId, { planId })
  if (!limitCheck.ok) {
    throw new Error(formatPlanLimitError(limitCheck) || 'Plan limits exceeded')
  }

  const ctx = await resolvePlatformPlanChange(adminClient, tenantId, planId, interval)

  // 1) Update the provider first — swap the subscription's price in place,
  //    prorate, and keep tenant/plan metadata current so the webhook
  //    reconciles correctly.
  const provider = getPaymentProvider(ctx.provider)
  if (!provider.updateSubscription) {
    throw new Error(`${ctx.provider} declares supportsPlanChange but implements no updateSubscription`)
  }
  await provider.updateSubscription(ctx.subId, {
    newProviderPriceId: ctx.targetPriceId,
    prorationBehavior: 'create_prorations',
    // Paying for a different plan un-cancels (#546 §1). `resolvePlatformPlanChange`
    // accepts a still-`active` subscription, which a cancel-at-period-end sub is
    // right up to its last day — without this the school changes plan, is billed,
    // and is still dropped to free at period end.
    cancelAtPeriodEnd: false,
    metadata: {
      tenant_id: tenantId,
      plan_id: ctx.plan.plan_id,
      plan_slug: ctx.plan.slug,
      interval,
    },
  })

  // 2) Optimistically mirror into our DB so the UI reflects immediately. The
  //    customer.subscription.updated echo maps the new price back to this same
  //    plan_id and hits applyPortalPlanChange's no-op guard.
  const now = new Date().toISOString()
  await adminClient
    .from('platform_subscriptions')
    .update({
      plan_id: ctx.plan.plan_id,
      interval,
      cancel_at_period_end: false,
      canceled_at: null,
      // An admin-initiated, Stripe-backed change supersedes a super-admin comp
      // (#546 §3): Stripe and the DB now agree again, so the reconciler should
      // resume applying portal changes for this tenant.
      plan_override_by: null,
      plan_override_at: null,
      updated_at: now,
    })
    .eq('tenant_id', tenantId)
  await adminClient
    .from('tenants')
    .update({ plan: ctx.plan.slug, updated_at: now })
    .eq('id', tenantId)
  await adminClient
    .from('revenue_splits')
    .upsert(
      {
        tenant_id: tenantId,
        platform_percentage: ctx.plan.transaction_fee_percent,
        school_percentage: 100 - ctx.plan.transaction_fee_percent,
        updated_at: now,
      },
      { onConflict: 'tenant_id' }
    )

  // Pre-flight check above already confirmed the new plan's limits are met,
  // so this clears any cutoff scheduled from a prior over-limit period.
  await reconcileAccessCutoff(adminClient, tenantId)

  // Loop E. Below the provider call and the DB mirror, so this only ever counts
  // a change that actually took at BOTH ends — the #461 invariant. `from_plan`
  // is captured from the pre-change subscription inside
  // `resolvePlatformPlanChange`, above the mirror that has since overwritten it.
  await track(
    ANALYTICS_EVENTS.PLAN_CHANGED,
    {
      ...planChangeProperties(
        ctx,
        interval,
        Number((interval === 'yearly' ? ctx.plan.price_yearly : ctx.plan.price_monthly) ?? 0),
      ),
      provider: ctx.provider,
      change_path: 'in_app_swap',
    },
    { userId, tenantId, role: 'admin' },
  )

  revalidatePath('/dashboard/admin/billing')
  return { success: true, plan: ctx.plan.slug }
}

/**
 * Cancel subscription (sets cancel_at_period_end)
 */
export async function cancelSubscription() {
  const { userId, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // `current_period_start`, `created_at` and the plan embed exist for the
  // churn event below — `days_subscribed` is the number that says whether
  // schools leave in week one or year two, and it cannot be reconstructed after
  // the fact from the cancel flag alone.
  const { data: subscription } = await adminClient
    .from('platform_subscriptions')
    .select(
      'provider_subscription_id, payment_provider, status, interval, current_period_start, current_period_end, created_at, platform_plans(slug)',
    )
    .eq('tenant_id', tenantId)
    .single()

  if (!subscription || subscription.status !== 'active') {
    throw new Error('No active subscription to cancel')
  }

  // Only a provider that drives the billing period itself has anything to be
  // told (#604). For a `selfManagedPeriod` rail — bank transfer, one-time
  // crypto — cancelling means "do not extend at period end", which is purely
  // our own state; there is no provider call to make and inventing one would
  // fail against a provider that has no subscription object at all.
  const provider = subscription.payment_provider as PaymentProvider
  const capabilities = PROVIDER_CAPABILITIES[provider]
  const cancelsAtProvider =
    !!capabilities && !capabilities.selfManagedPeriod && !!subscription.provider_subscription_id

  if (cancelsAtProvider) {
    const providerClient = getPaymentProvider(provider)
    // Cancel at the provider first (at period end), so a failure leaves both
    // sides still renewing rather than us showing a cancellation the provider
    // never scheduled.
    //
    // A missing method here is a contract violation, not a rail without the
    // concept: `selfManagedPeriod: false` says this provider drives the period,
    // so skipping the call and writing the mirror anyway would report a
    // cancellation while the provider kept billing — the same DB-only cancel
    // this issue set out to remove. Fail loudly, as changePlan does.
    if (!providerClient.cancelSubscription) {
      throw new Error(`${provider} drives its own billing period but implements no cancelSubscription`)
    }
    await providerClient.cancelSubscription(subscription.provider_subscription_id!, false)
  }

  // Mirror locally so the overview reflects the pending cancellation
  // immediately. `cancel_at_period_end` is the ONLY signal that a cancel is
  // scheduled (#545) and `canceled_at` is informational — they are always
  // written together, and reactivate clears both together. For a provider that
  // emits renewal webhooks, its own event later confirms this with the
  // provider's authoritative values.
  const canceledAt = new Date().toISOString()
  await adminClient
    .from('platform_subscriptions')
    .update({
      cancel_at_period_end: true,
      canceled_at: canceledAt,
      updated_at: canceledAt,
    })
    .eq('tenant_id', tenantId)

  // Loop E. `_scheduled`, not `_canceled`: `cancel_at_period_end` is the ONLY
  // signal that a cancel is coming (#545) and the school keeps its plan until
  // the period ends — `subscription_expired` from the cron is the terminal
  // event. Counting this one as churn would report the loss on the wrong day
  // and double-count it when the period finally lapses.
  await track(
    ANALYTICS_EVENTS.SUBSCRIPTION_CANCEL_SCHEDULED,
    {
      scope: 'platform',
      plan: planSlugOf(subscription.platform_plans) ?? 'unknown',
      provider: subscription.payment_provider,
      interval: subscription.interval,
      days_subscribed: daysSince(subscription.created_at),
      access_ends_at: subscription.current_period_end,
      canceled_at_provider: cancelsAtProvider,
    },
    { userId, tenantId, role: 'admin' },
  )

  revalidatePath('/dashboard/admin/billing')
  return { success: true }
}

/** Whole days from an ISO stamp to now, or `null` when it is missing. */
function daysSince(from: string | null | undefined): number | null {
  if (!from) return null
  const ms = Date.now() - new Date(from).getTime()
  return Number.isFinite(ms) ? Math.max(Math.round(ms / 86_400_000), 0) : null
}

/** PostgREST types a to-one embed as a possible array; the FK makes it a row. */
function planSlugOf(embed: unknown): string | null {
  const row = Array.isArray(embed) ? embed[0] : embed
  return (row as { slug?: string | null } | null)?.slug ?? null
}

/**
 * Undo a pending cancellation (#546 §1).
 *
 * Cancellation was one-way: the only writers of `cancel_at_period_end` were
 * `cancelSubscription` (sets it) and the Stripe webhook (mirrors Stripe), the
 * billing UI imported no reactivate action at all, and re-checkout is blocked
 * while the subscription is still `active` — which a cancel-at-period-end
 * subscription is until its last day. A school that changed its mind had no way
 * back short of contacting support.
 */
export async function reactivateSubscription() {
  const { userId, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // `canceled_at` is read here for `days_since_cancel` — the win-back window.
  // It has to be captured BEFORE the update below nulls it.
  const { data: subscription } = await adminClient
    .from('platform_subscriptions')
    .select(
      'provider_subscription_id, payment_provider, status, cancel_at_period_end, current_period_end, canceled_at, interval, platform_plans(slug)',
    )
    .eq('tenant_id', tenantId)
    .single()

  if (!subscription) throw new Error('No subscription to reactivate')
  if (!subscription.cancel_at_period_end) {
    throw new Error('This subscription is not scheduled for cancellation')
  }
  // Once the period has lapsed the cron has already downgraded (or is about
  // to); reactivating would revive a plan nobody is paying for. Those schools
  // go through checkout / a renewal request instead.
  if (subscription.status !== 'active') {
    throw new Error('This subscription has already ended. Please start a new plan instead.')
  }
  if (
    subscription.current_period_end &&
    new Date(subscription.current_period_end) <= new Date()
  ) {
    throw new Error('Your billing period has already ended. Please start a new plan instead.')
  }

  // Mirror of the cancel path (#604): a provider that scheduled the cancel on
  // its own side must clear it, or a DB-only "reactivate" would leave the
  // provider still set to cancel and the subscription would lapse anyway.
  const provider = subscription.payment_provider as PaymentProvider
  const capabilities = PROVIDER_CAPABILITIES[provider]
  if (capabilities && !capabilities.selfManagedPeriod && subscription.provider_subscription_id) {
    const providerClient = getPaymentProvider(provider)
    // The provider is authoritative — clear it there first so a failure leaves
    // both sides still cancelling rather than disagreeing. As in the cancel
    // path, a missing method must throw: a DB-only "reactivate" is the worse
    // direction of the same bug, since the school is told it is safe while the
    // provider is still set to stop billing and the plan lapses anyway.
    if (!providerClient.reactivateSubscription) {
      throw new Error(`${provider} drives its own billing period but implements no reactivateSubscription`)
    }
    await providerClient.reactivateSubscription(subscription.provider_subscription_id)
  }

  await adminClient
    .from('platform_subscriptions')
    .update({
      cancel_at_period_end: false,
      canceled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)

  // Loop E. Paired with `subscription_cancel_scheduled`, this is the save rate:
  // how many schools that scheduled a cancel changed their mind, and how long
  // the window between the two decisions is.
  await track(
    ANALYTICS_EVENTS.SUBSCRIPTION_REACTIVATED,
    {
      scope: 'platform',
      plan: planSlugOf(subscription.platform_plans) ?? 'unknown',
      provider: subscription.payment_provider,
      interval: subscription.interval,
      days_since_cancel: daysSince(subscription.canceled_at),
    },
    { userId, tenantId, role: 'admin' },
  )

  revalidatePath('/dashboard/admin/billing')
  return { success: true }
}

/**
 * Upload payment proof for a platform payment request (school admin)
 */
export async function uploadPaymentProof(requestId: string, formData: FormData) {
  const { userId, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Verify request belongs to tenant
  const { data: request } = await adminClient
    .from('platform_payment_requests')
    .select('request_id, tenant_id, status')
    .eq('request_id', requestId)
    .eq('tenant_id', tenantId)
    .single()

  if (!request) throw new Error('Request not found')

  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('No file provided')
  if (file.size > 10 * 1024 * 1024) throw new Error('File must be less than 10MB')

  const ext = file.name.split('.').pop() || 'bin'
  const path = `platform/${tenantId}/${requestId}/proof.${ext}`

  const supabase = await createClient()
  const { error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(path, file, { upsert: true })

  if (uploadError) {
    console.error('Failed to upload proof:', uploadError)
    throw new Error('Failed to upload file')
  }

  const { data: urlData } = supabase.storage
    .from('payment-proofs')
    .getPublicUrl(path)

  // Since bucket is private, generate a signed URL instead
  const { data: signedUrlData } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(path, 60 * 60 * 24 * 365) // 1 year

  const proofUrl = signedUrlData?.signedUrl || urlData.publicUrl

  // Uploading proof advances the request to `payment_received` so a super
  // admin can see the school has paid — unless it's already been
  // confirmed/rejected, in which case the status is left untouched.
  const advanceStatus =
    request.status === 'pending' || request.status === 'instructions_sent'

  await adminClient
    .from('platform_payment_requests')
    .update({
      proof_url: proofUrl,
      ...(advanceStatus ? { status: 'payment_received' } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)

  revalidatePath('/dashboard/admin/billing')
  return { proofUrl }
}

/**
 * Request a manual subscription renewal (before current period ends)
 */
export async function requestManualRenewal() {
  const { userId, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Get current subscription
  const { data: subscription } = await adminClient
    .from('platform_subscriptions')
    .select('*, platform_plans(*)')
    .eq('tenant_id', tenantId)
    .single()

  if (!subscription) throw new Error('No active subscription found')
  if (subscription.payment_provider !== 'manual') {
    throw new Error('Renewal is only for manual transfer subscriptions')
  }

  // Check period ends within 30 days
  const periodEnd = new Date(subscription.current_period_end)
  const now = new Date()
  const daysUntilEnd = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  // The window guard used to be bypassed entirely for any non-`active` status
  // (#546 §2), so a canceled or long-lapsed subscription could mint the row
  // that pauses the downgrade at any time. A school in grace (`past_due`) must
  // still be able to pay — that is the whole point of the pause — so allow it
  // explicitly rather than by falling through the guard.
  const lapsed = daysUntilEnd <= 0 || subscription.status === 'past_due'
  if (daysUntilEnd > 30 && !lapsed) {
    throw new Error('Renewal can only be requested within 30 days of period end')
  }

  // One open request per tenant, whatever its type: the old guard filtered on
  // `request_type = 'renewal'` while the upgrade guard did not, so creating a
  // renewal alongside a pending upgrade was the ordinary way to get two rows —
  // after which `.single()` returned PGRST116 and BOTH guards passed forever.
  if (await hasOpenPaymentRequest(adminClient, tenantId)) {
    throw new Error('You already have a pending payment request. Please wait for it to be processed.')
  }

  const plan = subscription.platform_plans as { plan_id: string; price_monthly: number; price_yearly: number }
  const amount = subscription.interval === 'yearly' ? plan.price_yearly : plan.price_monthly

  const { data: request, error } = await adminClient
    .from('platform_payment_requests')
    .insert({
      tenant_id: tenantId,
      plan_id: subscription.plan_id,
      requested_by: userId,
      interval: subscription.interval,
      amount,
      currency: 'usd',
      status: 'pending',
      request_type: 'renewal',
      expires_at: requestExpiresAt(),
    })
    .select('request_id')
    .single()

  if (error) {
    console.error('Failed to create renewal request:', error)
    throw new Error('Failed to create renewal request')
  }

  revalidatePath('/dashboard/admin/billing')
  return { requestId: request.request_id }
}

/**
 * Re-evaluate this school's usage against its plan and apply the result
 * immediately (issue #550).
 *
 * Every other `reconcileAccessCutoff` call site is a plan-change event, and the
 * cutoff notice asks for a *usage* change. The usage-side actions now reconcile
 * on their own, but they can only cover the paths that run inside this app —
 * a course archived by a direct SQL fix, a membership changed by a super admin,
 * or simply a reconcile that failed and was swallowed leaves a stale cutoff
 * with nothing to clear it. Making it an explicit button means recovery never
 * depends on `/api/cron/*` being scheduled at all (#513), which is the whole
 * reason this issue exists.
 *
 * Reports the outcome rather than just succeeding, so an admin who is still
 * over the limit learns that from the same click instead of from silence.
 */
export async function recheckPlanLimits() {
  await verifyAdminAccess()
  const tenantId = await getCurrentTenantId()
  const adminClient = createAdminClient()

  const decision = await reconcileAccessCutoff(adminClient, tenantId)

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('access_cutoff_at')
    .eq('id', tenantId)
    .maybeSingle()

  revalidatePath('/dashboard/admin/billing')
  revalidatePath('/dashboard/admin')

  return {
    cleared: decision.action === 'clear',
    accessCutoffAt: (tenant?.access_cutoff_at as string | null) ?? null,
  }
}
