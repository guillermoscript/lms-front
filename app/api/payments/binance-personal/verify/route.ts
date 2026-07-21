/**
 * binance_personal confirmation endpoint (issue #482).
 *
 * Personal Binance Pay has NO webhook — confirmation is polled from the
 * school's own read-only Pay history. The checkout page polls this endpoint;
 * given our `transactionId`, we:
 *   1. load the pending transaction (must belong to the caller + tenant),
 *   2. load + decrypt the tenant's Pay credentials (tenant_payment_wallets),
 *   3. fetch recent incoming transfers and run the shared reconcile core
 *      (note-code match / exact-amount match / ambiguous → never guess),
 *   4. on a match, the core flips the transaction → successful (the
 *      after_transaction_update trigger creates the entitlements).
 *
 * Security: the caller can only reference their OWN pending transaction, and
 * a confirmation requires a REAL transfer in the school's account history —
 * fetched server-side with the school's key — so a caller cannot fabricate
 * one. The status='pending' guard + orderId consume keep it idempotent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import {
  loadBinancePersonalConfig,
  fetchTenantPayTransfers,
  reconcileBinancePersonalTransaction,
} from '@/lib/payments/binance-personal-reconcile'
import { paymentPollLimiter, binancePayHistoryLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase environment variables not set')
  return createAdminSupabase(url, serviceKey)
}

export async function POST(req: NextRequest) {
  try {
    const { transactionId } = await req.json()
    if (!transactionId) {
      return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 })
    }

    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await paymentPollLimiter.check(30, user.id)
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Load the transaction, scoped to the caller + tenant.
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .select('transaction_id, status, amount, payment_provider, tenant_id, plan_id, transaction_date')
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (txError || !tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }
    if (tx.payment_provider !== 'binance_personal') {
      return NextResponse.json({ error: 'Not a Binance personal transaction' }, { status: 400 })
    }

    // Idempotent: already confirmed by a prior poll / the cron.
    if (tx.status === 'successful') {
      return NextResponse.json({ confirmed: true, alreadyProcessed: true })
    }
    if (tx.status !== 'pending') {
      return NextResponse.json({ confirmed: false, status: tx.status })
    }

    const admin = getSupabaseAdmin()
    const config = await loadBinancePersonalConfig(admin, tenantId)
    if (!config) {
      return NextResponse.json(
        { error: 'School has not configured Binance Pay (personal)' },
        { status: 400 },
      )
    }

    // Per-TENANT budget on outbound Binance calls (the endpoint is
    // weight-heavy). When throttled, report "still pending" so the client
    // keeps polling instead of erroring out.
    try {
      await binancePayHistoryLimiter.check(12, tenantId)
    } catch {
      return NextResponse.json({ confirmed: false, throttled: true })
    }

    let transfers
    try {
      transfers = await fetchTenantPayTransfers(config, new Date(tx.transaction_date ?? Date.now()).getTime())
    } catch (err) {
      console.error('[binance-personal/verify] Pay-history fetch failed:', err)
      return NextResponse.json({ error: 'Could not reach Binance right now' }, { status: 503 })
    }

    const result = await reconcileBinancePersonalTransaction(admin, tx, transfers)
    switch (result.status) {
      case 'confirmed':
        return NextResponse.json(
          result.alreadyProcessed
            ? { confirmed: true, alreadyProcessed: true }
            : { confirmed: true, orderId: result.orderId },
        )
      case 'not_found':
        return NextResponse.json({ confirmed: false })
      case 'ambiguous':
        // A colliding payment exists — an admin must confirm manually; the
        // client shows the "we received a payment but need to verify it" note.
        return NextResponse.json({ confirmed: false, ambiguous: true })
      case 'replayed':
        return NextResponse.json(
          { error: 'This Binance payment was already used for another order' },
          { status: 409 },
        )
      case 'config_error':
        return NextResponse.json({ error: result.message }, { status: 400 })
      default:
        return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }
  } catch (error) {
    console.error('[binance-personal/verify] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
