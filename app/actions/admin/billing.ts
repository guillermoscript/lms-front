'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { checkPlanLimits, countTenantUsage, formatPlanLimitError } from '@/lib/billing/plan-limits'
import { classifyPlanChange } from '@/lib/billing/plan-change'
import { reconcileAccessCutoff } from '@/lib/billing/access-cutoff'
import {
  OPEN_REQUEST_STATUSES,
  isRequestOpen,
  requestExpiresAt,
} from '@/lib/billing/payment-request-ttl'
import { revalidatePath } from 'next/cache'

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
 * Is there an open (pending and not lapsed) platform payment request for this
 * tenant? One helper for both duplicate guards so a renewal can never be
 * created alongside a pending upgrade — the combination that used to disable
 * both guards permanently, because each returned `PGRST116 / data: null` from
 * `.single()` once two rows matched.
 */
async function hasOpenPaymentRequest(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  tenantId: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from('platform_payment_requests')
    .select('request_id, status, expires_at')
    .eq('tenant_id', tenantId)
    .in('status', OPEN_REQUEST_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(20)

  return ((data as { status: string; expires_at: string | null }[] | null) || []).some((r) =>
    isRequestOpen(r)
  )
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
  const [tenantResult, subscriptionResult, usage] = await Promise.all([
    adminClient
      .from('tenants')
      .select('plan, billing_status, billing_period_end, billing_email, stripe_customer_id, access_cutoff_at')
      .eq('id', tenantId)
      .single(),
    adminClient
      .from('platform_subscriptions')
      .select('*, platform_plans(*)')
      .eq('tenant_id', tenantId)
      .single(),
    countTenantUsage(adminClient, tenantId),
  ])

  const tenant = tenantResult.data
  const subscription = subscriptionResult.data
  const planSlug = tenant?.plan || 'free'

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
    hasStripeCustomer: !!tenant?.stripe_customer_id,
    accessCutoffAt: tenant?.access_cutoff_at ?? null,
    subscription: subscription ? {
      status: subscription.status,
      paymentMethod: subscription.payment_method,
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
      paymentMethod: subscription?.payment_method || null,
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
    transactionFeePercent: planDetails?.transaction_fee_percent || 10,
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
export async function requestManualPlanUpgrade(planId: string, interval: 'monthly' | 'yearly' = 'monthly', bankReference?: string, notes?: string) {
  const { userId, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

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
      bank_reference: bankReference || null,
      notes: notes || null,
      expires_at: requestExpiresAt(),
    })
    .select('request_id')
    .single()

  if (error) {
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
  const supabase = await createClient()
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

  // Get the request
  const { data: request } = await adminClient
    .from('platform_payment_requests')
    .select('*, platform_plans(slug, transaction_fee_percent)')
    .eq('request_id', requestId)
    .single()

  if (!request) throw new Error('Request not found')
  if (request.status === 'confirmed') throw new Error('Already confirmed')

  const plan = request.platform_plans as { slug: string; transaction_fee_percent: number }

  // Check downgrade limits before activating
  const limitError = await checkDowngradeLimits(adminClient, request.tenant_id, request.plan_id)
  if (limitError) throw new Error(limitError)

  // Update request status
  await adminClient
    .from('platform_payment_requests')
    .update({
      status: 'confirmed',
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)

  // Calculate period: for renewals, extend from old period end (no gap)
  const now = new Date()
  let periodStart: Date

  if (request.request_type === 'renewal') {
    // Get existing subscription to extend from its end date
    const { data: existingSub } = await adminClient
      .from('platform_subscriptions')
      .select('current_period_end')
      .eq('tenant_id', request.tenant_id)
      .single()

    const oldEnd = existingSub?.current_period_end ? new Date(existingSub.current_period_end) : now
    // If old period hasn't ended yet, start from old end; otherwise start from now
    periodStart = oldEnd > now ? oldEnd : now
  } else {
    periodStart = now
  }

  const periodEnd = new Date(periodStart)
  if (request.interval === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  }

  // Upsert subscription
  await adminClient
    .from('platform_subscriptions')
    .upsert({
      tenant_id: request.tenant_id,
      plan_id: request.plan_id,
      status: 'active',
      payment_method: 'manual_transfer',
      interval: request.interval,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      grace_period_end: null,
      // Reset the reminder stamp so the next cycle can remind again.
      renewal_reminder_sent_at: null,
      // A confirmed payment is an un-cancel (#546 §1). PostgREST's ON CONFLICT
      // DO UPDATE only touches the columns supplied here, so omitting these two
      // left a stale `cancel_at_period_end = true` on the row: the school paid
      // for a full period and was then silently dropped to free at the end of
      // it by the cron's cancel phase, with no reminder and no grace window
      // (phases 1 and 2 both filter on `cancel_at_period_end = false`).
      cancel_at_period_end: false,
      canceled_at: null,
      // A real payment supersedes any super-admin comp (#546 §3) — this is one
      // of the override's exits, so portal changes start syncing again.
      plan_override_by: null,
      plan_override_at: null,
      updated_at: now.toISOString(),
    }, { onConflict: 'tenant_id' })

  // Update tenant plan
  await adminClient
    .from('tenants')
    .update({
      plan: plan.slug,
      billing_status: 'active',
      billing_period_end: periodEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', request.tenant_id)

  // Update revenue splits
  await adminClient
    .from('revenue_splits')
    .upsert({
      tenant_id: request.tenant_id,
      platform_percentage: plan.transaction_fee_percent,
      school_percentage: 100 - plan.transaction_fee_percent,
      updated_at: now.toISOString(),
    }, { onConflict: 'tenant_id' })

  // Activation already passed the pre-flight limit check above, so this
  // clears any cutoff scheduled from a prior over-limit period.
  await reconcileAccessCutoff(adminClient, request.tenant_id)

  return { success: true }
}

/**
 * Load the pieces needed to modify an active Stripe platform subscription: the
 * live Stripe subscription item + the target plan's Stripe price. Throws a
 * friendly Error for every non-actionable state (no active sub, manual sub,
 * free target, unconfigured price, unreadable Stripe subscription).
 */
async function resolvePlatformPlanChange(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  tenantId: string,
  planId: string,
  interval: 'monthly' | 'yearly',
) {
  const { data: sub } = await adminClient
    .from('platform_subscriptions')
    .select('stripe_subscription_id, stripe_customer_id, payment_method, status')
    .eq('tenant_id', tenantId)
    .single()

  if (!sub || sub.status !== 'active') {
    throw new Error('No active subscription to change')
  }
  if (sub.payment_method !== 'stripe' || !sub.stripe_subscription_id) {
    throw new Error('In-app plan change is only available for Stripe subscriptions.')
  }

  const { data: plan } = await adminClient
    .from('platform_plans')
    .select('plan_id, slug, name, transaction_fee_percent, stripe_price_id_monthly, stripe_price_id_yearly')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .single()

  if (!plan) throw new Error('Plan not found')
  if (plan.slug === 'free') {
    throw new Error('To move to the Free plan, cancel your subscription instead.')
  }

  const targetPriceId = interval === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly
  if (!targetPriceId) {
    throw new Error('Stripe price is not configured for this plan. Please contact support.')
  }

  const { getStripe } = await import('@/lib/stripe')
  const stripe = getStripe()
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = (stripeSub as any).items?.data?.[0]
  if (!item?.id) {
    throw new Error('Could not read the current subscription from Stripe.')
  }

  return {
    stripe,
    subId: sub.stripe_subscription_id as string,
    itemId: item.id as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customerId: (sub.stripe_customer_id as string) || ((stripeSub as any).customer as string),
    targetPriceId: targetPriceId as string,
    plan,
  }
}

/**
 * Preview an in-app plan change for an active Stripe subscriber. Returns the
 * blocking limit violations (computed before any Stripe call) OR a Stripe
 * proration preview so the admin sees the credit/charge before confirming.
 */
export async function previewPlanChange(planId: string, interval: 'monthly' | 'yearly' = 'monthly') {
  const { tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Pre-flight limit check BEFORE any Stripe call.
  const limitCheck = await checkPlanLimits(adminClient, tenantId, { planId })
  if (!limitCheck.ok) {
    return { ok: false as const, violations: limitCheck.violations, planName: limitCheck.planName }
  }

  const ctx = await resolvePlatformPlanChange(adminClient, tenantId, planId, interval)

  try {
    const preview = await ctx.stripe.invoices.createPreview({
      customer: ctx.customerId,
      subscription: ctx.subId,
      subscription_details: {
        items: [{ id: ctx.itemId, price: ctx.targetPriceId }],
        proration_behavior: 'create_prorations',
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = preview as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (p.lines?.data || []) as any[]
    const prorationAmount = lines
      .filter((l) => l?.parent?.subscription_item_details?.proration)
      .reduce((sum, l) => sum + (l.amount ?? 0), 0)
    return {
      ok: true as const,
      proration: {
        prorationAmount: prorationAmount / 100,
        total: (p.amount_due ?? p.total ?? 0) / 100,
        currency: (p.currency || 'usd').toUpperCase(),
        planName: ctx.plan.name,
      },
    }
  } catch (err) {
    console.error('Failed to preview plan change:', err)
    // Preview is best-effort — allow the change to proceed without one.
    return { ok: true as const, proration: null }
  }
}

/**
 * Apply an in-app plan change (upgrade / downgrade / interval switch) for an
 * active Stripe subscriber, replacing the old "use the Stripe portal" punt.
 *
 * Order matters: the pre-flight limit check and the Stripe update run BEFORE any
 * DB write, so an over-limit downgrade is blocked with actionable messaging and
 * our plan state only ever moves after Stripe confirms (the #461 invariant —
 * Stripe price and DB plan may never disagree). The subsequent optimistic DB
 * mirror lets the webhook echo (applyPortalPlanChange) hit its no-op guard.
 */
export async function changePlan(planId: string, interval: 'monthly' | 'yearly' = 'monthly') {
  const { tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Pre-flight limit check BEFORE touching Stripe.
  const limitCheck = await checkPlanLimits(adminClient, tenantId, { planId })
  if (!limitCheck.ok) {
    throw new Error(formatPlanLimitError(limitCheck) || 'Plan limits exceeded')
  }

  const ctx = await resolvePlatformPlanChange(adminClient, tenantId, planId, interval)

  // 1) Update Stripe first — swap the subscription item's price, prorate, and
  //    keep tenant/plan metadata current so the webhook reconciles correctly.
  await ctx.stripe.subscriptions.update(ctx.subId, {
    items: [{ id: ctx.itemId, price: ctx.targetPriceId }],
    proration_behavior: 'create_prorations',
    // Paying for a different plan un-cancels (#546 §1). `resolvePlatformPlanChange`
    // accepts a still-`active` subscription, which a cancel-at-period-end sub is
    // right up to its last day — without this the school changes plan, is billed,
    // and is still dropped to free at period end.
    cancel_at_period_end: false,
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

  revalidatePath('/dashboard/admin/billing')
  return { success: true, plan: ctx.plan.slug }
}

/**
 * Cancel subscription (sets cancel_at_period_end)
 */
export async function cancelSubscription() {
  const { tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  const { data: subscription } = await adminClient
    .from('platform_subscriptions')
    .select('stripe_subscription_id, payment_method, status')
    .eq('tenant_id', tenantId)
    .single()

  if (!subscription || subscription.status !== 'active') {
    throw new Error('No active subscription to cancel')
  }

  if (subscription.payment_method === 'stripe' && subscription.stripe_subscription_id) {
    // Cancel via Stripe (at period end).
    const { getStripe } = await import('@/lib/stripe')
    await getStripe().subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    })
    // Mirror locally so the overview reflects the pending cancellation
    // immediately; the customer.subscription.updated webhook confirms it with
    // Stripe's authoritative values.
    await adminClient
      .from('platform_subscriptions')
      .update({
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
  } else {
    // Manual subscription — just mark for cancellation.
    await adminClient
      .from('platform_subscriptions')
      .update({
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
  }

  revalidatePath('/dashboard/admin/billing')
  return { success: true }
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
  const { tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  const { data: subscription } = await adminClient
    .from('platform_subscriptions')
    .select('stripe_subscription_id, payment_method, status, cancel_at_period_end, current_period_end')
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

  if (subscription.payment_method === 'stripe' && subscription.stripe_subscription_id) {
    // Stripe is authoritative for Stripe subs — clear it there first so a
    // failure leaves both sides still cancelling rather than disagreeing.
    const { getStripe } = await import('@/lib/stripe')
    await getStripe().subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    })
  }

  await adminClient
    .from('platform_subscriptions')
    .update({
      cancel_at_period_end: false,
      canceled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)

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
  if (subscription.payment_method !== 'manual_transfer') {
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
