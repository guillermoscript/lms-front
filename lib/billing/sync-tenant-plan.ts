import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Point a tenant at `planSlug` without any payment: tenants.plan, revenue_splits
 * and platform_subscriptions all move together (issue #468). Never calls a payment
 * provider, so a tenant with a live Stripe subscription keeps paying for what it
 * actually bought. Extracted from the former `forceTenantPlanChange`; shared by
 * `setTenantBillingMode`. Caller is responsible for authorisation and for
 * reconciling the access cutoff afterwards.
 */
export async function syncTenantPlan(
  adminClient: SupabaseClient,
  tenantId: string,
  planSlug: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const { data: plan } = await adminClient
    .from('platform_plans')
    .select('plan_id, slug, transaction_fee_percent')
    .eq('slug', planSlug)
    .single()
  if (!plan) throw new Error('Plan not found')

  const { error: tenantError } = await adminClient
    .from('tenants')
    .update({ plan: planSlug, updated_at: nowIso })
    .eq('id', tenantId)
  if (tenantError) throw new Error(`Failed to update tenant plan: ${tenantError.message}`)

  await adminClient.from('revenue_splits').upsert(
    {
      tenant_id: tenantId,
      platform_percentage: plan.transaction_fee_percent,
      school_percentage: 100 - plan.transaction_fee_percent,
      updated_at: nowIso,
    },
    { onConflict: 'tenant_id' },
  )

  const { data: existingSub } = await adminClient
    .from('platform_subscriptions')
    .select('subscription_id, status, current_period_end')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (planSlug === 'free') {
    // Free needs no active subscription — cancel any existing row so the
    // subscription and the tenant's plan agree.
    if (existingSub) {
      await adminClient
        .from('platform_subscriptions')
        .update({ plan_id: plan.plan_id, status: 'canceled', canceled_at: nowIso, updated_at: nowIso })
        .eq('tenant_id', tenantId)
    }
  } else if (existingSub) {
    // Preserve the billing period only on a live paid cycle; otherwise clear it so
    // the override is indefinite and the expiry cron cannot undo it.
    const liveCycle =
      existingSub.status === 'active' &&
      existingSub.current_period_end != null &&
      new Date(existingSub.current_period_end) > new Date()
    await adminClient
      .from('platform_subscriptions')
      .update({
        plan_id: plan.plan_id,
        status: 'active',
        updated_at: nowIso,
        ...(liveCycle
          ? {}
          : { current_period_end: null, grace_period_end: null, cancel_at_period_end: false, canceled_at: null }),
      })
      .eq('tenant_id', tenantId)
  } else {
    // No subscription yet: create a manual override row. current_period_end stays
    // NULL on purpose — the expire cron ignores NULL period ends, so it is indefinite.
    await adminClient.from('platform_subscriptions').insert({
      tenant_id: tenantId,
      plan_id: plan.plan_id,
      status: 'active',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: nowIso,
      current_period_end: null,
    })
  }
}
