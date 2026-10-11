/**
 * Crank cron for native Solana auto-pull subscriptions (issue #280).
 *
 * The on-chain Subscriptions program has NO scheduler — WE pull each period.
 * Active and past-due subscriptions are charged only when their real on-chain
 * period is due. Both revenue shares settle atomically, then a confirmed receipt
 * updates the paid-through deadline. Previously confirmed transfers can repair a
 * missing receipt without charging again.
 *
 * Scheduled every ten minutes in vercel.json. Secured by CRON_SECRET.
 * Requires: SOLANA_RPC_URL, SOLANA_PULLER_SECRET_KEY (base58 of the whitelisted
 * puller keypair, must hold SOL for fees), SOLANA_PLATFORM_WALLET,
 * SOLANA_USDC_MINT (native subs are SPL — pulls are token transfers).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { renewSolanaSubscription, type SolanaRenewalRow } from '@/lib/payments/solana-renewal'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || !provided || !safeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rpcUrl = process.env.SOLANA_RPC_URL
  const pullerSecret = process.env.SOLANA_PULLER_SECRET_KEY
  const platformWallet = process.env.SOLANA_PLATFORM_WALLET
  const mintEnv = process.env.SOLANA_USDC_MINT
  if (!rpcUrl || !pullerSecret || !platformWallet || !mintEnv) {
    // Deliberately unconfigured rail → 200 + `skipped`, not 503 (see
    // solana-reconcile, #660). Scheduled deployments can leave this rail disabled.
    return NextResponse.json({ success: true, skipped: 'solana_subscriptions_not_configured' })
  }

  const admin = getSupabaseAdmin()

  // Active native-subscription rows, with their on-chain coordinates + amount.
  // We also pull the cancel fields so the pull/cancel decision (which must never
  // charge a canceled sub — issue #460) has the full DB state.
  //
  // Paged and count-verified (#548). This read IS the crank's work queue, and
  // this queue drives scheduled Solana renewal charges: a row silently dropped at the API cap is a period that never
  // gets billed, for a subscriber whose access we keep extending. Ordered by
  // primary key so the pages are stable. `fetchAllRows` throws on an
  // incomplete read, so a short queue can no longer look like a finished one.
  let subs: SolanaRenewalRow[]
  try {
    subs = await fetchAllRows<SolanaRenewalRow>('subscriptions', (from, to) =>
      admin
        .from('subscriptions')
        .select(
          'subscription_id, start_date, tenant_id, plan_id, provider_metadata, subscription_status, cancel_at_period_end, cancel_at, provider_subscription_id, plans(price)',
          { count: 'exact' },
        )
        .eq('payment_provider', 'solana_subs')
        .in('subscription_status', ['active', 'past_due'])
        .order('subscription_id')
        .range(from, to),
    )
  } catch (err) {
    console.error('[solana-pull] query error', err)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }
  if (!subs.length) return NextResponse.json({ pulled: 0 })

  let pulled = 0
  let insufficientFunds = 0
  let reconciled = 0
  const errors: string[] = []
  for (const sub of subs) {
    try {
      const result = await renewSolanaSubscription(admin, sub)
      if (result.status === 'paid') {
        if (result.reconciled) reconciled++
        else pulled++
      }
      if (result.status === 'insufficient_funds') insufficientFunds++
    } catch (error) {
      errors.push(`sub ${sub.subscription_id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (errors.length) console.warn('[solana-pull] errors:', errors)
  return NextResponse.json({ pulled, reconciled, insufficientFunds, errors: errors.length })
}
