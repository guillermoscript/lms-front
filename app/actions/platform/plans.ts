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

export async function forceTenantPlanChange(tenantId: string, planSlug: string) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { data: plan } = await adminClient
    .from('platform_plans')
    .select('plan_id, slug, transaction_fee_percent')
    .eq('slug', planSlug)
    .single()

  if (!plan) throw new Error('Plan not found')

  await adminClient
    .from('tenants')
    .update({ plan: planSlug, updated_at: new Date().toISOString() })
    .eq('id', tenantId)

  // Update revenue split
  await adminClient
    .from('revenue_splits')
    .upsert({
      tenant_id: tenantId,
      platform_percentage: plan.transaction_fee_percent,
      school_percentage: 100 - plan.transaction_fee_percent,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' })

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
