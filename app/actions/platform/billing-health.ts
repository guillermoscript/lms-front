'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import { computeBillingHealth, type AtRiskTenant } from '@/lib/billing/billing-health'

async function verifySuperAdmin() {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')
  return userId
}

export async function getAtRiskTenants(): Promise<AtRiskTenant[]> {
  await verifySuperAdmin()
  const admin = createAdminClient()

  const { data: tenants } = await admin
    .from('tenants')
    .select('id, name, plan, access_cutoff_at')
    .eq('billing_status', 'past_due')

  const tenantIds = (tenants || []).map((t) => t.id)

  const { data: subscriptions } = tenantIds.length
    ? await admin
        .from('platform_subscriptions')
        .select('tenant_id, payment_method, current_period_end, grace_period_end')
        .in('tenant_id', tenantIds)
    : { data: [] }

  return computeBillingHealth(
    (tenants || []).map((t) => ({
      tenantId: t.id,
      tenantName: t.name,
      plan: t.plan,
      accessCutoffAt: t.access_cutoff_at,
    })),
    (subscriptions || []).map((s) => ({
      tenantId: s.tenant_id,
      paymentMethod: s.payment_method,
      currentPeriodEnd: s.current_period_end,
      gracePeriodEnd: s.grace_period_end,
    })),
    new Date(),
  )
}
