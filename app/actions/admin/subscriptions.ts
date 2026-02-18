'use server'

import { createAdminClient, verifyAdminAccess } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'

/**
 * Cancel a subscription (immediately or at period end)
 */
export async function cancelSubscription(
  subscriptionId: number,
  immediate: boolean = false
) {
  try {
    // Verify admin access
    const hasAccess = await verifyAdminAccess()
    if (!hasAccess) {
      return { success: false, error: 'Unauthorized: Admin access required' }
    }

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    const supabase = createAdminClient()
    const stripe = getStripe()

    // Get subscription details and verify tenant ownership
    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*, profiles(stripe_customer_id)')
      .eq('subscription_id', subscriptionId)
      .single()

    if (fetchError || !subscription) {
      return { success: false, error: 'Subscription not found' }
    }

    // Verify subscription belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && subscription.tenant_id !== tenantId) {
      return { success: false, error: 'Subscription not found or access denied' }
    }

    // If subscription has a Stripe subscription ID, cancel it in Stripe
    // (Stripe subscription ID is typically stored in transaction_id or similar field)
    // For now, we'll just update the database status
    
    const updates: any = {
      // Use 'canceled' (correct enum value) for immediate; keep 'active' for period-end
      subscription_status: immediate ? 'canceled' : 'active',
      canceled_at: new Date().toISOString(),
    }

    if (!immediate) {
      updates.cancel_at_period_end = true
      updates.cancel_at = subscription.current_period_end || subscription.end_date
    } else {
      updates.end_date = new Date().toISOString()
      updates.current_period_end = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('subscription_id', subscriptionId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('Database update error:', updateError)
      return { success: false, error: 'Failed to update subscription' }
    }

    // For immediate cancellation, the DB trigger already disabled linked enrollments.
    // For period-end cancellation, enrollments stay active until the cron job
    // or a future webhook fires when the period ends.

    // Revalidate the subscriptions page
    revalidatePath('/dashboard/admin/subscriptions')

    return { success: true }
  } catch (error) {
    console.error('Cancel subscription error:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Reactivate a subscription that was scheduled to cancel
 */
export async function reactivateSubscription(subscriptionId: number) {
  try {
    // Verify admin access
    const hasAccess = await verifyAdminAccess()
    if (!hasAccess) {
      return { success: false, error: 'Unauthorized: Admin access required' }
    }

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    const supabase = createAdminClient()

    // Get subscription details and verify tenant ownership
    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .single()

    if (fetchError || !subscription) {
      return { success: false, error: 'Subscription not found' }
    }

    // Verify subscription belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && subscription.tenant_id !== tenantId) {
      return { success: false, error: 'Subscription not found or access denied' }
    }

    // Only reactivate if it was scheduled to cancel
    if (!subscription.cancel_at_period_end) {
      return { success: false, error: 'Subscription is not scheduled to cancel' }
    }

    // Reactivate the subscription
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        cancel_at_period_end: false,
        cancel_at: null,
      })
      .eq('subscription_id', subscriptionId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('Database update error:', updateError)
      return { success: false, error: 'Failed to reactivate subscription' }
    }

    // Revalidate the subscriptions page
    revalidatePath('/dashboard/admin/subscriptions')

    return { success: true }
  } catch (error) {
    console.error('Reactivate subscription error:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Get subscription details with full information
 */
export async function getSubscriptionDetails(subscriptionId: number) {
  try {
    const hasAccess = await verifyAdminAccess()
    if (!hasAccess) {
      return { success: false, error: 'Unauthorized: Admin access required', data: null }
    }

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('subscriptions')
      .select(
        `
        *,
        profiles!subscriptions_user_id_fkey (
          full_name,
          email,
          stripe_customer_id
        ),
        plans (
          plan_name,
          price,
          currency,
          duration_type,
          features
        )
      `
      )
      .eq('subscription_id', subscriptionId)
      .single()

    if (error) {
      return { success: false, error: 'Subscription not found', data: null }
    }

    // Verify subscription belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && data.tenant_id !== tenantId) {
      return { success: false, error: 'Subscription not found or access denied', data: null }
    }

    return { success: true, data, error: null }
  } catch (error) {
    console.error('Get subscription details error:', error)
    return { success: false, error: 'An unexpected error occurred', data: null }
  }
}
