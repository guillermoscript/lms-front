'use server'

import { createAdminClient, verifyAdminAccess } from '@/lib/supabase/admin'
import { getPaymentProvider, PaymentProvider } from '@/lib/payments'
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

    // If the subscription is managed by an external provider, cancel it there
    // first (provider-agnostic). Manual subscriptions no-op. We still update our
    // own row below regardless, so a provider error shouldn't strand the admin —
    // but we no longer swallow it silently: some providers (e.g. solana_subs)
    // cannot cancel server-side, and reporting a clean success while the
    // provider-side authorization is still live is the money leak in #460. We
    // surface the message so the UI can warn the admin.
    let providerCancelError: string | undefined
    if (subscription.provider_subscription_id) {
      try {
        const provider = getPaymentProvider(
          (subscription.payment_provider as PaymentProvider) || 'stripe'
        )
        await provider.cancelSubscription?.(subscription.provider_subscription_id, immediate)
      } catch (providerError) {
        providerCancelError =
          providerError instanceof Error ? providerError.message : String(providerError)
        console.error('Provider cancelSubscription failed (continuing to update DB):', providerError)
      }
    }

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

    // `providerCancelError` is set when the DB row was canceled but the provider
    // could not be canceled server-side (e.g. solana_subs needs the student's
    // wallet signature). The cancel still succeeded on our side; the UI turns
    // this into a warning rather than a plain success.
    return { success: true, providerCancelError }
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

    // Reverse the provider-side cancel too. A DB-only reactivate would leave the
    // provider (e.g. Stripe) still set to cancel at period end, so the sub would
    // lapse anyway. Errors are surfaced as a warning, not swallowed (mirrors the
    // cancel action) — some providers (solana_subs) cannot reactivate server-side.
    let providerReactivateError: string | undefined
    if (subscription.provider_subscription_id) {
      try {
        const provider = getPaymentProvider(
          (subscription.payment_provider as PaymentProvider) || 'stripe'
        )
        await provider.reactivateSubscription?.(subscription.provider_subscription_id)
      } catch (providerError) {
        providerReactivateError =
          providerError instanceof Error ? providerError.message : String(providerError)
        console.error('Provider reactivateSubscription failed (continuing to update DB):', providerError)
      }
    }

    // Reactivate the subscription. NB: `cancel_at` is NOT NULL in the schema —
    // setting it to null here would fail the update (a latent bug that silently
    // broke admin reactivate). Clearing `cancel_at_period_end` un-schedules the
    // subscription-expiry crons, but the Solana auto-pull crank
    // (lib/payments/solana-pull-decision.ts) reads `cancel_at` on its own, so we
    // push it forward to the live period end instead of leaving a past value that
    // would re-cancel the row. `canceled_at` is cleared.
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        cancel_at_period_end: false,
        cancel_at: subscription.current_period_end || subscription.end_date,
        canceled_at: null,
      })
      .eq('subscription_id', subscriptionId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('Database update error:', updateError)
      return { success: false, error: 'Failed to reactivate subscription' }
    }

    // Revalidate the subscriptions page
    revalidatePath('/dashboard/admin/subscriptions')

    return { success: true, providerReactivateError }
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
        profiles!subscriptions_user_profile_fkey (
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
