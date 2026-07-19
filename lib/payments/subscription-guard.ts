/**
 * Parallel-subscription guard (issue #459).
 *
 * The `subscriptions` unique constraint is (user_id, plan_id), so checking out
 * a *different* plan creates a second, parallel subscription — and for native
 * providers, a second live provider subscription double-billing every cycle.
 * Until a real plan-change flow exists (#463), every plan checkout entry point
 * calls this guard before creating any transaction / provider session.
 *
 * Renewal-safe: re-purchasing a plan the user already holds is the renewal
 * path (`handle_new_subscription` ON CONFLICT extends the period) and is never
 * blocked — including for users who already hold parallel subscriptions from
 * before this guard existed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Statuses that mean "this subscription still bills / grants access". */
export const BLOCKING_SUBSCRIPTION_STATUSES = ['active', 'past_due']

/** English fallback shown when an API path is hit directly; the checkout pages
 * render a translated notice before the user ever reaches these routes. */
export const PARALLEL_SUBSCRIPTION_MESSAGE =
  'You already have an active plan. Contact your school to switch plans — subscribing to another plan would bill you for both.'

export const PARALLEL_SUBSCRIPTION_CODE = 'parallel_subscription'

export interface ConflictingSubscription {
  subscription_id: number
  plan_id: number
  plan_name: string | null
  end_date: string | null
}

/**
 * Returns the subscription that would run in parallel with a checkout of
 * `planId`, or null when the checkout is safe (no live subscription in this
 * tenant, or the user already holds this exact plan — a renewal).
 *
 * Throws on query failure so callers fail closed (no checkout on unknown
 * state) — the DB-level backstop in `handle_new_subscription` is the last
 * line of defense, but it fires after money may have moved.
 */
export async function findConflictingSubscription(
  supabase: SupabaseClient,
  { userId, tenantId, planId }: { userId: string; tenantId: string; planId: number },
): Promise<ConflictingSubscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('subscription_id, plan_id, end_date, plan:plans(plan_name)')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('subscription_status', BLOCKING_SUBSCRIPTION_STATUSES)

  if (error) {
    throw new Error(`Could not verify existing subscriptions: ${error.message}`)
  }
  if (!data || data.length === 0) return null

  // Holding the requested plan already → renewal, always allowed.
  if (data.some((sub) => sub.plan_id === planId)) return null

  const conflict = data[0]
  const plan = conflict.plan as unknown as { plan_name: string | null } | null
  return {
    subscription_id: conflict.subscription_id,
    plan_id: conflict.plan_id,
    plan_name: plan?.plan_name ?? null,
    end_date: conflict.end_date,
  }
}
