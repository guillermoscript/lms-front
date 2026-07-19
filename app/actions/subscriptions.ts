'use server'

/**
 * Student self-service subscription management (issue #464).
 *
 * Students cancel their own subscription at period end and can undo it before
 * the period ends. Both actions are scoped to the current user: a student can
 * only touch a subscription row they own, inside their current tenant. Because
 * students cannot UPDATE `subscriptions` under RLS, these use the service-role
 * admin client and validate ownership explicitly before every write (per the
 * CLAUDE.md admin-client rule).
 *
 * `solana_subs` is NOT handled here — it keeps its own on-chain wallet-revoke
 * flow (RevokeSolanaDelegation) because the server cannot revoke the delegation.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getPaymentProvider, PaymentProvider } from '@/lib/payments'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'

type ActionResult = { success: true; providerWarning?: string } | { success: false; error: string }

// Statuses a student is allowed to cancel from (a live, still-billing subscription).
const CANCELABLE = ['active', 'renewed', 'past_due']

/**
 * Cancel the current student's subscription at the end of the current period.
 * Access continues until then; no renewal charge is taken on any provider.
 */
export async function cancelMySubscription(subscriptionId: number): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return { success: false, error: 'unauthenticated' }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .single()

    if (fetchError || !subscription) return { success: false, error: 'not_found' }

    // Ownership: only the student's own subscription, in their current tenant.
    if (subscription.user_id !== userId || subscription.tenant_id !== tenantId) {
      return { success: false, error: 'access_denied' }
    }

    // Idempotent — already scheduled to cancel.
    if (subscription.cancel_at_period_end) return { success: true }

    if (!CANCELABLE.includes(subscription.subscription_status)) {
      return { success: false, error: 'not_cancelable' }
    }

    // Cancel at the provider (at period end) when there's an external subscription.
    // A provider error must NOT strand the student — the DB row is the source of
    // truth for access and the crank/webhook honors cancel_at_period_end — so we
    // surface it as a non-fatal warning, mirroring the admin cancel action.
    let providerWarning: string | undefined
    if (subscription.provider_subscription_id) {
      try {
        const provider = getPaymentProvider(
          (subscription.payment_provider as PaymentProvider) || 'stripe'
        )
        await provider.cancelSubscription?.(subscription.provider_subscription_id, false)
      } catch (providerError) {
        providerWarning =
          providerError instanceof Error ? providerError.message : String(providerError)
        console.error('Student cancel: provider cancelSubscription failed (continuing to update DB):', providerError)
      }
    }

    // Schedule the cancel in our DB. Status stays 'active' so access continues to
    // period end; the cron / webhook flips it to expired when the period lapses.
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        cancel_at: subscription.current_period_end || subscription.end_date,
        canceled_at: new Date().toISOString(),
        subscription_status: 'active',
      })
      .eq('subscription_id', subscriptionId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('Student cancel: DB update error:', updateError)
      return { success: false, error: 'update_failed' }
    }

    // Let the school know a student canceled (best-effort — never fails the cancel).
    await notifySchoolAdminsOfCancel(supabase, {
      tenantId,
      studentId: userId,
      planId: subscription.plan_id,
      accessEndsAt: subscription.current_period_end || subscription.end_date,
    })

    revalidatePath('/dashboard/student/billing')
    return { success: true, providerWarning }
  } catch (error) {
    console.error('cancelMySubscription error:', error)
    return { success: false, error: 'unexpected' }
  }
}

/**
 * Undo a scheduled cancel-at-period-end for the current student's subscription,
 * before the period ends. Reverses the provider-side cancel too, so it truly
 * keeps renewing.
 */
export async function reactivateMySubscription(subscriptionId: number): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return { success: false, error: 'unauthenticated' }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .single()

    if (fetchError || !subscription) return { success: false, error: 'not_found' }

    if (subscription.user_id !== userId || subscription.tenant_id !== tenantId) {
      return { success: false, error: 'access_denied' }
    }

    if (!subscription.cancel_at_period_end) {
      return { success: false, error: 'not_scheduled' }
    }

    // Reverse the provider-side cancel first. If the provider can't reactivate
    // (e.g. solana_subs), surface it as a warning but still clear our flag so the
    // UI reflects the student's intent.
    let providerWarning: string | undefined
    if (subscription.provider_subscription_id) {
      try {
        const provider = getPaymentProvider(
          (subscription.payment_provider as PaymentProvider) || 'stripe'
        )
        await provider.reactivateSubscription?.(subscription.provider_subscription_id)
      } catch (providerError) {
        providerWarning =
          providerError instanceof Error ? providerError.message : String(providerError)
        console.error('Student reactivate: provider reactivateSubscription failed (continuing to update DB):', providerError)
      }
    }

    // NB: `cancel_at` is NOT NULL in the schema — never set it to null here or the
    // update is rejected. Clearing `cancel_at_period_end` un-schedules the
    // subscription-expiry crons, but the Solana auto-pull crank
    // (lib/payments/solana-pull-decision.ts) reads `cancel_at` on its own, so we
    // push it forward to the live period end instead of leaving a past value that
    // could re-cancel the row. `canceled_at` is cleared.
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
      console.error('Student reactivate: DB update error:', updateError)
      return { success: false, error: 'update_failed' }
    }

    revalidatePath('/dashboard/student/billing')
    return { success: true, providerWarning }
  } catch (error) {
    console.error('reactivateMySubscription error:', error)
    return { success: false, error: 'unexpected' }
  }
}

/**
 * Best-effort: notify every active school admin that a student canceled. One
 * `notifications` row + a `user_notifications` fan-out. Never throws — a
 * notification failure must not fail the cancel.
 */
async function notifySchoolAdminsOfCancel(
  admin: SupabaseClient,
  params: { tenantId: string; studentId: string; planId: number; accessEndsAt: string | null }
) {
  const { tenantId, studentId, planId, accessEndsAt } = params
  try {
    const [{ data: adminUsers }, { data: student }, { data: plan }] = await Promise.all([
      admin
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .eq('status', 'active'),
      admin.from('profiles').select('full_name').eq('id', studentId).maybeSingle(),
      admin.from('plans').select('plan_name').eq('plan_id', planId).maybeSingle(),
    ])

    const adminIds: string[] = (adminUsers || []).map((u: { user_id: string }) => u.user_id)
    if (adminIds.length === 0) return

    const studentName = student?.full_name || 'A student'
    const planName = plan?.plan_name || 'their subscription'
    const endsClause = accessEndsAt
      ? ` Access ends on ${new Date(accessEndsAt).toISOString().slice(0, 10)}.`
      : ''

    const { data: notification } = await admin
      .from('notifications')
      .insert({
        title: 'A student canceled their subscription',
        content: `${studentName} canceled their ${planName} subscription. It will not renew.${endsClause}`,
        notification_type: 'info',
        priority: 'normal',
        target_type: 'user',
        target_user_ids: adminIds,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: studentId,
        tenant_id: tenantId,
      })
      .select('id')
      .single()

    if (notification) {
      await admin
        .from('user_notifications')
        .insert(adminIds.map((userId) => ({ notification_id: notification.id, user_id: userId })))
    }
  } catch (error) {
    console.error('notifySchoolAdminsOfCancel failed (non-fatal):', error)
  }
}
