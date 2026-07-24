'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { computeOwedBalances, DEFAULT_SCHOOL_PERCENTAGE, type TenantOwed } from '@/lib/payments/payouts-owed'

async function verifySuperAdmin() {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')
  return userId
}

const PLATFORM_SETTLED_PROVIDERS = (Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]).filter(
  (provider) => PROVIDER_CAPABILITIES[provider].settlesToPlatformAccount
)

export async function getPayoutsOwed(): Promise<TenantOwed[]> {
  await verifySuperAdmin()
  const admin = createAdminClient()

  const [{ data: tenants }, { data: splits }, { data: txns }, { data: paid }] = await Promise.all([
    admin.from('tenants').select('id, name'),
    admin.from('revenue_splits').select('tenant_id, school_percentage'),
    admin
      .from('transactions')
      .select('tenant_id, payment_provider, amount, school_percentage_snapshot')
      .eq('status', 'successful')
      .in('payment_provider', PLATFORM_SETTLED_PROVIDERS),
    admin.from('payouts').select('tenant_id, amount').eq('payout_method', 'manual').eq('status', 'paid'),
  ])

  const schoolPercentageByTenant = new Map(
    (splits || []).map((s) => [s.tenant_id, s.school_percentage as number])
  )

  return computeOwedBalances(
    (tenants || []).map((t) => ({
      tenantId: t.id,
      tenantName: t.name,
      schoolPercentage: schoolPercentageByTenant.get(t.id) ?? DEFAULT_SCHOOL_PERCENTAGE,
    })),
    (txns || [])
      .filter((t) => t.tenant_id && t.payment_provider && t.amount != null)
      .map((t) => ({
        tenantId: t.tenant_id as string,
        paymentProvider: t.payment_provider as string,
        amount: t.amount as number,
        schoolPercentageSnapshot: t.school_percentage_snapshot as number | null,
      })),
    (paid || []).map((p) => ({ tenantId: p.tenant_id, amount: p.amount }))
  )
}

export async function markPayoutPaid(tenantId: string, amount: number, note?: string) {
  const userId = await verifySuperAdmin()
  if (!(amount > 0)) throw new Error('Amount must be positive')

  const admin = createAdminClient()
  const { error } = await admin.from('payouts').insert({
    tenant_id: tenantId,
    amount,
    currency: 'usd',
    status: 'paid',
    payout_method: 'manual',
    paid_at: new Date().toISOString(),
    recorded_by: userId,
    note: note || null,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/platform/payouts')
}
