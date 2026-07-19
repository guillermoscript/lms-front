import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Moves a tenant to the free plan: cancels its platform subscription, resets
 * the tenant billing fields, and rewrites its revenue split.
 *
 * The split is read from the free plan's `transaction_fee_percent` in
 * `platform_plans` rather than hardcoded (the seed value is 10%, but reading
 * the row keeps this correct if the free-plan fee ever changes). Shared by the
 * expiry cron and the Stripe platform webhook's `customer.subscription.deleted`
 * handler so both agree on how a downgrade is written.
 *
 * Requires a service-role client — `revenue_splits` is super-admin-only under RLS.
 * Returns the platform fee percent that was applied.
 */
export async function downgradeTenantToFree(
  adminClient: AdminClient,
  tenantId: string
): Promise<number> {
  const now = new Date().toISOString()

  // Read the free plan's fee so the split isn't hardcoded (falls back to 10%).
  const { data: freePlan } = await adminClient
    .from('platform_plans')
    .select('transaction_fee_percent')
    .eq('slug', 'free')
    .single()

  const platformFee = freePlan?.transaction_fee_percent ?? 10

  await adminClient
    .from('platform_subscriptions')
    .update({
      status: 'canceled',
      canceled_at: now,
      updated_at: now,
    })
    .eq('tenant_id', tenantId)

  await adminClient
    .from('tenants')
    .update({
      plan: 'free',
      billing_status: 'free',
      billing_period_end: null,
      updated_at: now,
    })
    .eq('id', tenantId)

  await adminClient
    .from('revenue_splits')
    .upsert({
      tenant_id: tenantId,
      platform_percentage: platformFee,
      school_percentage: 100 - platformFee,
      updated_at: now,
    }, { onConflict: 'tenant_id' })

  return platformFee
}
