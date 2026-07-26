'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { computeOwedBalances, DEFAULT_SCHOOL_PERCENTAGE, isPayoutMismatch, type TenantOwed } from '@/lib/payments/payouts-owed'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

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

  // Every read here is a whole-relation sweep whose rows are then summed, so a
  // PostgREST row cap would misstate the balance instead of failing (issue
  // #533): a short `transactions` read underpays the school, a short `payouts`
  // read overpays it. `fetchAllRows` pages and then verifies the row count it
  // collected against the server's own — hence `{ count: 'exact' }` and the
  // primary-key `.order()` on each of the four.
  const [tenants, splits, txns, paid] = await Promise.all([
    fetchAllRows('tenants', (from, to) =>
      admin.from('tenants').select('id, name', { count: 'exact' }).order('id').range(from, to)
    ),
    fetchAllRows('revenue_splits', (from, to) =>
      admin
        .from('revenue_splits')
        .select('tenant_id, school_percentage', { count: 'exact' })
        .order('split_id')
        .range(from, to)
    ),
    fetchAllRows('transactions', (from, to) =>
      admin
        .from('transactions')
        .select(
          'tenant_id, payment_provider, amount, refunded_amount, currency, school_percentage_snapshot, status, transaction_date',
          { count: 'exact' }
        )
        .in('status', ['successful', 'refunded'])
        .in('payment_provider', PLATFORM_SETTLED_PROVIDERS)
        .order('transaction_id')
        .range(from, to)
    ),
    fetchAllRows('payouts', (from, to) =>
      admin
        .from('payouts')
        .select('tenant_id, amount, currency, period_end, paid_at, created_at', { count: 'exact' })
        .eq('payout_method', 'manual')
        .eq('status', 'paid')
        .order('payout_id')
        .range(from, to)
    ),
  ])

  const schoolPercentageByTenant = new Map(
    splits.map((s) => [s.tenant_id, s.school_percentage as number])
  )

  return computeOwedBalances(
    tenants.map((t) => ({
      tenantId: t.id,
      tenantName: t.name,
      schoolPercentage: schoolPercentageByTenant.get(t.id) ?? DEFAULT_SCHOOL_PERCENTAGE,
    })),
    txns
      .filter((t) => t.tenant_id && t.payment_provider && t.amount != null)
      .map((t) => ({
        tenantId: t.tenant_id as string,
        paymentProvider: t.payment_provider as string,
        amount: t.amount as number,
        // Partial refunds shrink the sale instead of erasing it (#547).
        refundedAmount: t.refunded_amount as number | null,
        currency: t.currency || 'usd',
        schoolPercentageSnapshot: t.school_percentage_snapshot as number | null,
        status: t.status as 'successful' | 'refunded',
        transactionDate: t.transaction_date as string | null,
      })),
    // `period_end` is the exact "covered through" when a payout recorded a period;
    // manually recorded ones leave it null today, so fall back to when the money
    // actually moved (issue #511).
    paid.map((p) => ({
      tenantId: p.tenant_id,
      amount: p.amount,
      currency: p.currency || 'usd',
      coveredThrough: p.period_end ?? p.paid_at ?? p.created_at,
    }))
  )
}

/**
 * Record a manual payout.
 *
 * `idempotencyKey` is minted once per Mark-as-paid dialog OPEN and replayed on
 * every retry of that same submission, so a double-click, a reload, a second
 * tab, a second super admin on the same row and a server-action retry all
 * collapse to one `payouts` row (#547). Before it, the table's only uniqueness
 * was `UNIQUE (tenant_id, period_start, period_end)` — and manual rows leave
 * both period columns NULL, which Postgres treats as distinct, so the
 * constraint never fired. A duplicate wire could not even be corrected
 * afterwards: `CHECK (amount > 0)` forbids a compensating negative row.
 */
export async function markPayoutPaid(
  tenantId: string,
  amount: number,
  currency: string,
  note?: string,
  confirmMismatch = false,
  idempotencyKey?: string,
): Promise<{ status: 'ok' } | { status: 'warning'; netOwed: number }> {
  const userId = await verifySuperAdmin()
  if (!(amount > 0)) throw new Error('Amount must be positive')

  if (!confirmMismatch) {
    const owed = await getPayoutsOwed()
    const netOwed =
      owed.find((o) => o.tenantId === tenantId)?.balances.find((b) => b.currency === currency)?.netOwed ?? 0
    if (isPayoutMismatch(amount, netOwed)) {
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
    idempotency_key: idempotencyKey || null,
  })
  if (error) {
    // 23505 = unique_violation on idx_payouts_manual_idempotency: this exact
    // submission is already recorded. The operator asked for one payout and got
    // one payout, so this is success, not an error to show them.
    if (error.code === '23505') {
      revalidatePath('/platform/payouts')
      revalidatePath('/dashboard/admin/payouts')
      return { status: 'ok' }
    }
    throw new Error(error.message)
  }

  revalidatePath('/platform/payouts')
  revalidatePath('/dashboard/admin/payouts')
  return { status: 'ok' }
}
