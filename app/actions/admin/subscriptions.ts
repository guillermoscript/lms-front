'use server'

import { createAdminClient, verifyAdminAccess } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
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

    const supabase = createAdminClient()
    const stripe = getStripe()

    // Get subscription details
    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*, profiles(stripe_customer_id)')
      .eq('subscription_id', subscriptionId)
      .single()

    if (fetchError || !subscription) {
      return { success: false, error: 'Subscription not found' }
    }

    // If subscription has a Stripe subscription ID, cancel it in Stripe
    // (Stripe subscription ID is typically stored in transaction_id or similar field)
    // For now, we'll just update the database status
    
    const updates: any = {
      subscription_status: immediate ? 'cancelled' : 'active',
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

    if (updateError) {
      console.error('Database update error:', updateError)
      return { success: false, error: 'Failed to update subscription' }
    }

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

    const supabase = createAdminClient()

    // Get subscription details
    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .single()

    if (fetchError || !subscription) {
      return { success: false, error: 'Subscription not found' }
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

    return { success: true, data, error: null }
  } catch (error) {
    console.error('Get subscription details error:', error)
    return { success: false, error: 'An unexpected error occurred', data: null }
  }
}
