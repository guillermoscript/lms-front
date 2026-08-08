import type { createAdminClient } from '@/lib/supabase/admin'
import { reconcileAccessCutoff } from '@/lib/billing/access-cutoff'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Moves a tenant to the free plan: cancels its platform subscription, resets
 * the tenant billing fields, and rewrites its revenue split.
 *
 * The split is read from the free plan's `transaction_fee_percent` in
 * `platform_plans` rather than hardcoded (the seed value is 10%, but reading
 * the row keeps this correct if the free-plan fee ever changes). This writer is
 * used by the self-managed expiry cron. Provider webhooks use the exact-match
 * RPC wrapper below so a delayed superseded event cannot race a replacement.
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

  // Schedule (or leave alone) an access cutoff if the tenant now exceeds the
  // free plan's limits — see lib/billing/access-cutoff.ts (issue #494).
  await reconcileAccessCutoff(adminClient, tenantId)

  return platformFee
}

/**
 * Webhook-only exact identity downgrade. The database function locks the
 * current row and changes tenant/subscription/split atomically only when the
 * provider tuple still matches, so a delayed superseded event is a no-op.
 */
export async function downgradeTenantToFreeIfCurrent(
  adminClient: AdminClient,
  tenantId: string,
  paymentProvider: string,
  providerSubscriptionId: string,
): Promise<number | null> {
  const { data, error } = await adminClient.rpc('downgrade_platform_subscription_if_current', {
    _tenant_id: tenantId,
    _payment_provider: paymentProvider,
    _provider_subscription_id: providerSubscriptionId,
  })
  if (error) throw new Error(`Exact subscription downgrade failed: ${error.message}`)
  if (data == null) return null

  await reconcileAccessCutoff(adminClient, tenantId)
  return Number(data)
}
