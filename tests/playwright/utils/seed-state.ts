import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Seed rows that several specs depend on and that other specs destroy.
 *
 * `supabase/seed.sql` gives alice@student.com one successful plan-2001
 * transaction; the `trigger_manage_transactions` chain turns it into the
 * subscription + entitlements that `plan-change.spec.ts`,
 * `parallel-subscription-guard.spec.ts` and the checkout UI rely on. The
 * DB-only regressions (`entitlements-overlap`, `subscription-lapse`) delete
 * exactly those rows in their clean-up, so whatever runs after them in the same
 * database saw "no subscription" — which is how they passed on a warm laptop
 * and failed in CI (#667). Every spec that wipes Alice's plan state must call
 * `restoreAliceSeedSubscription()` in `afterAll`.
 */
export const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
export const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
export const ALICE_SEED_PLAN_ID = 2001

export function getServiceRoleClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Re-create the seeded plan-2001 subscription for Alice if it is gone. */
export async function restoreAliceSeedSubscription(admin: SupabaseClient = getServiceRoleClient()) {
  const { data: existing, error: readErr } = await admin
    .from('subscriptions')
    .select('subscription_id')
    .eq('user_id', ALICE_ID)
    .eq('plan_id', ALICE_SEED_PLAN_ID)
    .in('subscription_status', ['active', 'renewed', 'past_due'])
    .limit(1)
  if (readErr) throw new Error(`restoreAliceSeedSubscription: ${readErr.message}`)
  if (existing && existing.length > 0) return

  // Same shape as seed.sql (minus the fixed id — it is an identity column).
  // The insert fires the trigger that creates the subscription and its
  // entitlements for courses 2001, 2002 and 10005.
  const { error } = await admin.from('transactions').insert({
    user_id: ALICE_ID,
    tenant_id: CODE_ACADEMY_TENANT,
    plan_id: ALICE_SEED_PLAN_ID,
    amount: '19.00',
    currency: 'usd',
    status: 'successful',
    payment_method: 'seed_restore',
  })
  if (error) throw new Error(`restoreAliceSeedSubscription: ${error.message}`)
}
