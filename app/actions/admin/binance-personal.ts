'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { netOfRefunds } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
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

    // The money columns ride on the ownership read that was already happening.
    // `transaction_date` is the column name — `transactions` has NO `created_at`.
    const { data: tx, error: loadError } = await supabase
      .from('transactions')
      .select(
        'transaction_id, tenant_id, payment_provider, status, user_id, amount, currency, refunded_amount, school_percentage_snapshot, product_id, plan_id, transaction_date',
      )
      .eq('transaction_id', transactionId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!tx || tx.tenant_id !== tenantId || tx.payment_provider !== 'binance_personal') {
      return { success: false, error: 'Transaction not found' }
    }

    const { data: flipped, error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'successful' })
      .eq('transaction_id', transactionId)
      .eq('tenant_id', tenantId)
      .eq('payment_provider', 'binance_personal')
      .eq('status', 'pending')
      .select('transaction_id')
      .maybeSingle()

    if (updateError) throw updateError

    // Loop C. Same asynchronous-settlement shape as the manual bank-transfer
    // flow: an ADMIN is confirming, hours later, a transfer the BUYER made.
    // So the event is attributed to `tx.user_id` (never the admin) and
    // backdated to `transaction_date`, or personal-Binance sales would all
    // appear to have been bought by a handful of school admins on whichever day
    // they cleared their queue.
    //
    // Gated on the status-guarded flip so a double-click confirms once.
    if (flipped && tx.user_id) {
      const gross = Number(tx.amount ?? 0)
      const net = netOfRefunds(gross, tx.refunded_amount)
      const snapshot = tx.school_percentage_snapshot ?? null
      const bearsFee = !!PROVIDER_CAPABILITIES.binance_personal?.bearsPlatformFee
      const ctx = { userId: tx.user_id, tenantId, timestamp: tx.transaction_date }

      await track(
        ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
        {
          provider: 'binance_personal',
          amount_major: net,
          currency: tx.currency ?? 'usd',
          is_subscription: !!tx.plan_id,
          // `bearsPlatformFee` is false for binance_personal — the money never
          // reaches a platform account — so this is a hard 0, not a rate.
          ...(bearsFee
            ? snapshot != null
              ? { platform_fee: Math.round(net * (100 - Number(snapshot))) / 100 }
              : {}
            : { platform_fee: 0 }),
          school_percentage_snapshot: snapshot,
          gross_amount: gross,
          transaction_id: transactionId,
          settlement_path: 'admin_manual_confirm',
          ...(tx.product_id ? { product_id: tx.product_id } : {}),
          ...(tx.plan_id ? { plan_id: tx.plan_id } : {}),
        },
        ctx
      )

      const sourceType = tx.plan_id ? 'subscription' : 'product'
      const sourceId = tx.plan_id ?? tx.product_id
      if (sourceId != null) {
        const { count } = await supabase
          .from('entitlements')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', tx.user_id)
          .eq('source_type', sourceType)
          .eq('source_id', sourceId)
          .eq('status', 'active')
        await track(
          ANALYTICS_EVENTS.ENTITLEMENT_GRANTED,
          {
            source_type: sourceType,
            course_count: count ?? 0,
            provider: 'binance_personal',
            transaction_id: transactionId,
          },
          ctx
        )
      }
    }

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
