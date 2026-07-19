'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'
import { getCurrentUserId } from '@/lib/supabase/tenant'

async function verifySuperAdmin() {
  const supabase = await createClient()
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

export async function rejectManualPayment(requestId: string, reason: string) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('platform_payment_requests')
    .update({
      status: 'rejected',
      notes: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)

  if (error) throw new Error(`Failed to reject request: ${error.message}`)
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

export async function forceTenantPlanChange(tenantId: string, planSlug: string) {
  await verifySuperAdmin()
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
    .select('subscription_id')
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
          updated_at: nowIso,
        })
        .eq('tenant_id', tenantId)
    }
  } else if (existingSub) {
    // Point the existing subscription at the forced plan; preserve its period
    // and payment method.
    await adminClient
      .from('platform_subscriptions')
      .update({ plan_id: plan.plan_id, status: 'active', updated_at: nowIso })
      .eq('tenant_id', tenantId)
  } else {
    // No subscription yet (e.g. tenant was on free): create a manual override
    // row so the paid plan is backed by an active subscription.
    const periodStart = new Date()
    const periodEnd = new Date(periodStart)
    periodEnd.setMonth(periodEnd.getMonth() + 1)
    await adminClient
      .from('platform_subscriptions')
      .insert({
        tenant_id: tenantId,
        plan_id: plan.plan_id,
        status: 'active',
        payment_method: 'manual_transfer',
        interval: 'monthly',
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
  }

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
