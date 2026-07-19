/**
 * Reconciler cron for stranded pending one-time Solana payments (issue #467).
 *
 * One-time Solana confirmation relies entirely on the checkout page polling
 * `/api/payments/solana/verify`. If the student pays but closes the tab before
 * the on-chain transfer confirms, the transaction strands `pending` forever —
 * money taken on-chain, no entitlement granted — and the pending row also sits
 * in the partial unique indexes (transactions_unique_product/_plan), blocking a
 * retry checkout for the same item.
 *
 * This cron is the backstop the poll never provides:
 *   - Confirmed-but-stranded: re-run the on-chain confirmation (shared
 *     reconcile core) and flip → successful (the after_transaction_update
 *     trigger grants the entitlement).
 *   - Unpaid-but-stranded: after a TTL with no matching on-chain transfer,
 *     expire the row → 'canceled' so it leaves the unique-index predicate and
 *     the student can retry checkout cleanly.
 *
 * Run on a short schedule via Vercel Cron (vercel.json). Secured by CRON_SECRET.
 * Requires SOLANA_RPC_URL + SOLANA_PLATFORM_WALLET (per-tenant wallet + split
 * are resolved from the DB inside the reconcile core).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import {
  reconcileSolanaOneTimeTransaction,
  type OneTimeSolanaTx,
} from '@/lib/payments/solana-reconcile'

export const runtime = 'nodejs'

/**
 * How long a one-time Solana transaction may sit `pending` (measured from
 * `transaction_date`) before, if still not found on-chain, we expire it so the
 * student can retry checkout. Generous enough to outlast a slow confirmation;
 * for native SOL the amount is locked at checkout, so a long wait costs only
 * retry latency, never correctness.
 */
const PENDING_TTL_MINUTES = 30

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

interface PendingRow extends OneTimeSolanaTx {
  status: string
  payment_provider: string | null
  transaction_date: string
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || !provided || !safeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rpcUrl = process.env.SOLANA_RPC_URL
  const platformWallet = process.env.SOLANA_PLATFORM_WALLET
  if (!rpcUrl || !platformWallet) {
    return NextResponse.json({ error: 'Solana not configured' }, { status: 503 })
  }

  const admin = getSupabaseAdmin()

  // Pending one-time Solana transactions across all tenants (each row carries
  // its own tenant_id, used inside the reconcile core to resolve that tenant's
  // wallet + split). solana_subs is intentionally excluded — its initial
  // confirmation needs the server-captured subscriber pubkey and is a separate
  // path from one-time payments.
  const { data: pending, error } = await admin
    .from('transactions')
    .select(
      'transaction_id, amount, tenant_id, provider_subscription_id, settlement_currency, settlement_base, settlement_mint, status, payment_provider, transaction_date',
    )
    .eq('payment_provider', 'solana')
    .eq('status', 'pending')

  if (error) {
    console.error('[solana-reconcile] query error', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }
  if (!pending?.length) {
    return NextResponse.json({ reconciled: 0, expired: 0, errors: 0 })
  }

  const ttlCutoffMs = Date.now() - PENDING_TTL_MINUTES * 60_000
  let reconciled = 0
  let expired = 0
  const errors: string[] = []

  for (const tx of pending as PendingRow[]) {
    try {
      const result = await reconcileSolanaOneTimeTransaction(admin, tx)

      switch (result.status) {
        case 'confirmed':
          // Flip happened inside the core (or a concurrent poll beat us);
          // either way the payment is now settled.
          if (!result.alreadyProcessed) reconciled++
          break
        case 'not_found': {
          // No matching transfer on-chain. If the row has outlived the TTL it
          // is an abandoned checkout — expire it out of the unique-index
          // predicate so the student can retry. status-guarded so we never
          // clobber a row a concurrent poll just confirmed.
          const isStale = new Date(tx.transaction_date).getTime() < ttlCutoffMs
          if (isStale) {
            const { data: canceled } = await admin
              .from('transactions')
              .update({ status: 'canceled' })
              .eq('transaction_id', tx.transaction_id)
              .eq('status', 'pending')
              .select('transaction_id')
              .maybeSingle()
            if (canceled) expired++
          }
          break
        }
        case 'replayed':
          // Signature already consumed by another order — the poll would 409.
          // Nothing to grant; leave the row for manual review.
          errors.push(`tx ${tx.transaction_id}: signature already consumed`)
          break
        case 'validation_error':
          errors.push(`tx ${tx.transaction_id}: on-chain validation failed`)
          break
        case 'config_error':
          errors.push(`tx ${tx.transaction_id}: ${result.message}`)
          break
        default:
          errors.push(`tx ${tx.transaction_id}: ${result.message}`)
      }
    } catch (err) {
      errors.push(`tx ${tx.transaction_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (errors.length) console.warn('[solana-reconcile] errors:', errors)
  return NextResponse.json({ reconciled, expired, errors: errors.length })
}
