'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'

interface ActionResponse {
  success: boolean
  error?: string
}

export interface PendingBinancePersonalTransaction {
  transaction_id: number
  amount: number | null
  currency: string | null
  transaction_date: string | null
  user_id: string
  full_name: string
}

/**
 * Admin manually confirms an ambiguous `binance_personal` transaction (issue #482).
 *
 * Personal Binance Pay has no webhook, and when a buyer omits the note code and
 * the amount collides with another transfer, automated reconciliation can't
 * safely attribute the payment — it stays `pending`. Once the school admin has
 * verified the transfer in their own Binance app, they flip it here.
 *
 * Uses the service-role client (bypasses RLS), so admin role + tenant scope +
 * provider are validated below. The status-guarded update (`.eq('status','pending')`)
 * keeps it idempotent; the after_transaction_update trigger creates the
 * entitlements on the flip, so we never call enroll RPCs. No provider_charge_id
 * is set — a manual confirmation has no Binance orderId to consume.
 */
export async function confirmBinancePersonalTransaction(
  transactionId: number
): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data: tx, error: loadError } = await supabase
      .from('transactions')
      .select('transaction_id, tenant_id, payment_provider, status')
      .eq('transaction_id', transactionId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!tx || tx.tenant_id !== tenantId || tx.payment_provider !== 'binance_personal') {
      return { success: false, error: 'Transaction not found' }
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'successful' })
      .eq('transaction_id', transactionId)
      .eq('tenant_id', tenantId)
      .eq('payment_provider', 'binance_personal')
      .eq('status', 'pending')

    if (updateError) throw updateError

    revalidatePath('/dashboard/admin/payment-requests')

    return { success: true }
  } catch (error) {
    console.error('Error confirming Binance personal transaction:', error)
    return { success: false, error: 'Failed to confirm payment' }
  }
}

/**
 * Admin cancels a pending `binance_personal` transaction (issue #482) — used
 * when they've determined no payment ever arrived. Flips pending → canceled
 * with the same gating, ownership, and provider checks as the confirm action.
 */
export async function cancelBinancePersonalTransaction(
  transactionId: number
): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data: tx, error: loadError } = await supabase
      .from('transactions')
      .select('transaction_id, tenant_id, payment_provider, status')
      .eq('transaction_id', transactionId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!tx || tx.tenant_id !== tenantId || tx.payment_provider !== 'binance_personal') {
      return { success: false, error: 'Transaction not found' }
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'canceled' })
      .eq('transaction_id', transactionId)
      .eq('tenant_id', tenantId)
      .eq('payment_provider', 'binance_personal')
      .eq('status', 'pending')

    if (updateError) throw updateError

    revalidatePath('/dashboard/admin/payment-requests')

    return { success: true }
  } catch (error) {
    console.error('Error canceling Binance personal transaction:', error)
    return { success: false, error: 'Failed to cancel payment' }
  }
}

/**
 * List this tenant's pending `binance_personal` transactions for the admin
 * manual-confirmation queue (issue #482). Oldest first. `profiles` is global
 * and has no email column, so the buyer's display name is looked up via
 * `full_name`.
 */
export async function listPendingBinancePersonalTransactions(): Promise<
  PendingBinancePersonalTransaction[]
> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return []
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('transactions')
      .select('transaction_id, amount, currency, transaction_date, user_id')
      .eq('tenant_id', tenantId)
      .eq('payment_provider', 'binance_personal')
      .eq('status', 'pending')
      .order('transaction_date', { ascending: true })

    if (error) throw error

    const rows = data || []
    if (rows.length === 0) return []

    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)

    const nameById = new Map<string, string>(
      (profiles || []).map((p: { id: string; full_name: string | null }) => [
        p.id,
        p.full_name || '',
      ])
    )

    return rows.map((r) => ({
      transaction_id: r.transaction_id,
      amount: r.amount,
      currency: r.currency,
      transaction_date: r.transaction_date,
      user_id: r.user_id,
      full_name: nameById.get(r.user_id) || '',
    }))
  } catch (error) {
    console.error('Error listing pending Binance personal transactions:', error)
    return []
  }
}
