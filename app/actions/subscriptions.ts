'use server'

/**
 * Student self-service subscription management (issue #464).
 *
 * Students cancel their own subscription at period end and can undo it before
 * the period ends when the provider supports resuming. Both actions are scoped
 * to the current user: a student can
 * only touch a subscription row they own, inside their current tenant. Because
 * students cannot UPDATE `subscriptions` under RLS, these use the service-role
 * admin client and validate ownership explicitly before every write (per the
 * CLAUDE.md admin-client rule).
 *
 * Wallet delegation revocation uses its own signing flow, then calls the same
 * shared access rule. The server cannot sign on the student's behalf.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getPaymentProvider, PaymentProvider } from '@/lib/payments'
import { cancelIsFinalAtProvider, type CancellationResult } from '@/lib/payments/types'
import { applySubscriptionCancellation, cancelProviderSubscription, resumeProviderSubscription } from '@/lib/payments/subscription-cancellation'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
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

    if (!CANCELABLE.includes(subscription.subscription_status)) {
      return { success: false, error: 'not_cancelable' }
    }

    // Cancel at the provider (at period end) when there's an external subscription.
    // Local scheduling protects access and stops application-driven renewals.
    // External billing still needs provider confirmation: report any failure
    // as a warning, and retry it even when already scheduled locally. The shared
    // access operation is idempotent and never extends access on a retry.
    let providerWarning: string | undefined
    let cancellationResult: CancellationResult | undefined
    if (subscription.provider_subscription_id) {
      try {
        const provider = getPaymentProvider(
          (subscription.payment_provider as PaymentProvider) || 'stripe'
        )
        cancellationResult = await cancelProviderSubscription(provider, subscription.provider_subscription_id, false)
      } catch (providerError) {
        providerWarning =
          providerError instanceof Error ? providerError.message : String(providerError)
        console.error('Student cancel: provider cancelSubscription failed (continuing to update DB):', providerError)
      }
    }

    const accessEndsAt = await applySubscriptionCancellation(supabase, subscriptionId, { result: cancellationResult })

    // LEARNER churn, which is a different question from school churn — hence
    // the dedicated `student_subscription_*` name rather than Loop E's
    // `subscription_cancel_scheduled`. Access continues to period end, so this
    // is intent-to-leave, not the loss itself; the expiry cron emits the
    // terminal `subscription_expired`.
    //
    // `status_before` is worth carrying: cancelling must never IMPROVE a status
    // (#545), and a spike of cancels from `past_due` means students are leaving
    // because their payment method broke, not because the course disappointed.
    await track(
      ANALYTICS_EVENTS.STUDENT_SUBSCRIPTION_CANCEL_CONFIRMED,
      {
        provider: subscription.payment_provider ?? 'unknown',
        plan_id: subscription.plan_id,
        status_before: subscription.subscription_status,
        access_ends_at: accessEndsAt,
        days_subscribed: daysSince(subscription.created),
        provider_cancel_failed: !!providerWarning,
      },
      { userId, tenantId, role: 'student' }
    )

    // Let the school know a student canceled (best-effort — never fails the cancel).
    await notifySchoolAdminsOfCancel(supabase, {
      tenantId,
      studentId: userId,
      planId: subscription.plan_id,
      accessEndsAt,
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

    if (!['active', 'renewed', 'past_due'].includes(subscription.subscription_status)
      || !(Date.parse(subscription.current_period_end ?? subscription.end_date) > Date.now())) {
      return { success: false, error: 'not_reactivatable' }
    }

    // Final-at-provider cancellation cannot be undone. Clearing our flag here
    // would show "renewing" on a subscription that will never bill again, and
    // the student would silently lose access at the period end.
    if (subscription.provider_subscription_id && cancelIsFinalAtProvider(subscription.payment_provider)) {
      return { success: false, error: 'not_reactivatable' }
    }

    // Resume at the provider before clearing the local schedule. A provider
    // failure leaves the existing cancellation/access contract intact.
    if (subscription.provider_subscription_id) {
      try {
        const provider = getPaymentProvider(
          (subscription.payment_provider as PaymentProvider) || 'stripe'
        )
        await resumeProviderSubscription(provider, subscription.provider_subscription_id)
      } catch (providerError) {
        console.error('Student reactivate: provider reactivateSubscription failed:', providerError)
        return { success: false, error: 'provider_reactivation_failed' }
      }
    }

    // Un-schedule the cancel. `cancel_at` is cleared WITH the flag: since #545
    // it is nullable and the CHECK `subscriptions_cancel_at_requires_schedule`
    // rejects a cancel date that outlives its schedule, so a leftover date can
    // no longer be read as a live cancel by the Solana auto-pull crank.
    const { data: resumed, error: updateError } = await supabase.rpc('resume_subscription', {
      _subscription_id: subscriptionId,
    })
    if (updateError || !resumed) {
      if (subscription.provider_subscription_id) {
        try {
          const provider = getPaymentProvider((subscription.payment_provider as PaymentProvider) || 'stripe')
          await cancelProviderSubscription(provider, subscription.provider_subscription_id, false)
        } catch (providerError) {
          console.error('Resume compensation requires provider reconciliation:', providerError)
        }
      }
      return { success: false, error: updateError ? 'update_failed' : 'not_reactivatable' }
    }
    // `scope: 'student'` separates learner win-backs from the school-side
    // reactivations in `app/actions/admin/billing.ts`, which share this event
    // name. `canceled_at` is read off the row loaded before the update above
    // nulled it.
    await track(
      ANALYTICS_EVENTS.SUBSCRIPTION_REACTIVATED,
      {
        scope: 'student',
        provider: subscription.payment_provider ?? 'unknown',
        plan_id: subscription.plan_id,
        days_since_cancel: daysSince(subscription.canceled_at),
        provider_reactivate_failed: false,
      },
      { userId, tenantId, role: 'student' }
    )

    revalidatePath('/dashboard/student/billing')
    return { success: true }
  } catch (error) {
    console.error('reactivateMySubscription error:', error)
    return { success: false, error: 'unexpected' }
  }
}

/**
 * Whole days from an ISO stamp to now, or `null` when it is missing. Note the
 * caller reads `subscriptions.created` — this table has no `created_at`.
 */
function daysSince(from: string | null | undefined): number | null {
  if (!from) return null
  const ms = Date.now() - new Date(from).getTime()
  return Number.isFinite(ms) ? Math.max(Math.round(ms / 86_400_000), 0) : null
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
