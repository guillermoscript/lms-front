'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

async function verifyAdminAccess() {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!membership || membership.role !== 'admin') {
    throw new Error('Only school admins can manage billing')
  }

  return { user, tenantId, supabase }
}

/**
 * Get current subscription status and usage statistics
 */
export async function getSubscriptionStatus() {
  const { tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Fetch tenant, subscription, plan, and usage in parallel
  const [tenantResult, subscriptionResult, coursesCount, studentsCount] = await Promise.all([
    adminClient
      .from('tenants')
      .select('plan, billing_status, billing_period_end, billing_email, stripe_customer_id')
      .eq('id', tenantId)
      .single(),
    adminClient
      .from('platform_subscriptions')
      .select('*, platform_plans(*)')
      .eq('tenant_id', tenantId)
      .single(),
    adminClient
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    adminClient
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'student')
      .eq('status', 'active'),
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

  return {
    plan: planSlug,
    planName: planDetails?.name || 'Free',
    billingStatus: tenant?.billing_status || 'free',
    billingPeriodEnd: tenant?.billing_period_end,
    billingEmail: tenant?.billing_email,
    hasStripeCustomer: !!tenant?.stripe_customer_id,
    subscription: subscription ? {
      status: subscription.status,
      paymentMethod: subscription.payment_method,
      interval: subscription.interval,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
    } : null,
    usage: {
      courses: {
        current: coursesCount.count || 0,
        limit: limits.max_courses,
      },
      students: {
        current: studentsCount.count || 0,
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
export async function requestManualPlanUpgrade(planId: string, interval: 'monthly' | 'yearly' = 'monthly') {
  const { user, tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Get plan details
  const { data: plan } = await adminClient
    .from('platform_plans')
    .select('*')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .single()

  if (!plan) throw new Error('Plan not found')
  if (plan.slug === 'free') throw new Error('Cannot request upgrade to free plan')

  const amount = interval === 'yearly' ? plan.price_yearly : plan.price_monthly

  // Check for existing pending request
  const { data: existingRequest } = await adminClient
    .from('platform_payment_requests')
    .select('request_id')
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'instructions_sent', 'payment_received'])
    .single()

  if (existingRequest) {
    throw new Error('You already have a pending upgrade request. Please wait for it to be processed.')
  }

  const { data: request, error } = await adminClient
    .from('platform_payment_requests')
    .insert({
      tenant_id: tenantId,
      plan_id: planId,
      requested_by: user.id,
      interval,
      amount,
      currency: 'usd',
      status: 'pending',
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
  const [planResult, coursesResult, studentsResult] = await Promise.all([
    adminClient
      .from('platform_plans')
      .select('name, limits')
      .eq('plan_id', targetPlanId)
      .single(),
    adminClient
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .neq('status', 'archived'),
    adminClient
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'student')
      .eq('status', 'active'),
  ])

  const plan = planResult.data
  if (!plan) return null

  const limits = plan.limits as { max_courses?: number; max_students?: number } | null
  const maxCourses = limits?.max_courses ?? -1
  const maxStudents = limits?.max_students ?? -1
  const currentCourses = coursesResult.count ?? 0
  const currentStudents = studentsResult.count ?? 0

  const errors: string[] = []
  if (maxCourses !== -1 && currentCourses > maxCourses) {
    errors.push(`You have ${currentCourses} active courses but the ${plan.name} plan allows ${maxCourses}. Archive ${currentCourses - maxCourses} course(s) before downgrading.`)
  }
  if (maxStudents !== -1 && currentStudents > maxStudents) {
    errors.push(`You have ${currentStudents} students but the ${plan.name} plan allows ${maxStudents}.`)
  }

  return errors.length > 0 ? errors.join(' ') : null
}

/**
 * Super admin: confirm a manual bank transfer and activate the plan
 */
export async function confirmManualPayment(requestId: string) {
  const supabase = await createClient()
  const adminClient = await createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  // Verify super admin
  const { data: superAdmin } = await adminClient
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
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
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)

  // Calculate period end
  const now = new Date()
  const periodEnd = new Date(now)
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
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
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

  return { success: true }
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
    // Cancel via Stripe (at period end)
    const { getStripe } = await import('@/lib/stripe')
    await getStripe().subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    })
  } else {
    // Manual subscription — just mark for cancellation
    await adminClient
      .from('platform_subscriptions')
      .update({
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
  }

  return { success: true }
}
