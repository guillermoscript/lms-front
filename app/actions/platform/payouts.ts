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
      .select('tenant_id, payment_provider, amount, currency, school_percentage_snapshot, status, transaction_date')
      .in('status', ['successful', 'refunded'])
      .in('payment_provider', PLATFORM_SETTLED_PROVIDERS),
    admin
      .from('payouts')
      .select('tenant_id, amount, currency, period_end, paid_at, created_at')
      .eq('payout_method', 'manual')
      .eq('status', 'paid'),
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
        currency: t.currency || 'usd',
        schoolPercentageSnapshot: t.school_percentage_snapshot as number | null,
        status: t.status as 'successful' | 'refunded',
        transactionDate: t.transaction_date as string | null,
      })),
    // `period_end` is the exact "covered through" when a payout recorded a period;
    // manually recorded ones leave it null today, so fall back to when the money
    // actually moved (issue #511).
    (paid || []).map((p) => ({
      tenantId: p.tenant_id,
      amount: p.amount,
      currency: p.currency || 'usd',
      coveredThrough: p.period_end ?? p.paid_at ?? p.created_at,
    }))
  )
}

// A payout more than 10% off the currently owed balance is flagged for confirmation
// (catches typos like an extra zero) without ever hard-blocking a legitimate rounded
// or ahead-of-schedule payment.
const MISMATCH_THRESHOLD_PCT = 0.1

export async function markPayoutPaid(
  tenantId: string,
  amount: number,
  currency: string,
  note?: string,
  confirmMismatch = false,
): Promise<{ status: 'ok' } | { status: 'warning'; netOwed: number }> {
  const userId = await verifySuperAdmin()
  if (!(amount > 0)) throw new Error('Amount must be positive')

  if (!confirmMismatch) {
    const owed = await getPayoutsOwed()
    const netOwed =
      owed.find((o) => o.tenantId === tenantId)?.balances.find((b) => b.currency === currency)?.netOwed ?? 0
    if (Math.abs(amount - netOwed) > netOwed * MISMATCH_THRESHOLD_PCT) {
      return { status: 'warning', netOwed }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('payouts').insert({
    tenant_id: tenantId,
    amount,
    currency,
    status: 'paid',
    payout_method: 'manual',
    paid_at: new Date().toISOString(),
    recorded_by: userId,
    note: note || null,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/platform/payouts')
  revalidatePath('/dashboard/admin/payouts')
  return { status: 'ok' }
}
