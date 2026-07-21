/**
 * Reconciler cron for stranded pending binance_personal payments (issue #482).
 *
 * Confirmation for personal Binance Pay relies on the checkout page polling
 * `/api/payments/binance-personal/verify`. If the student transfers but closes
 * the tab first, the transaction strands `pending` — money sent, no
 * entitlement — and the pending row blocks a retry checkout via the partial
 * unique indexes. This cron is the backstop (modeled on the #467 Solana
 * reconciler):
 *
 *   - Paid-but-stranded: re-run the match against the school's Pay history
 *     (shared reconcile core) and flip → successful.
 *   - Unpaid-but-stranded: after a TTL with no matching transfer, expire the
 *     row → 'canceled' so the student can retry cleanly.
 *
 * Binance's Pay-history endpoint is weight-heavy (UID weight ~3000), so the
 * sweep batches ONE fetch per tenant and matches all of that tenant's pending
 * rows against it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import {
  loadBinancePersonalConfig,
  fetchTenantPayTransfers,
  reconcileBinancePersonalTransaction,
  type BinancePersonalTx,
} from '@/lib/payments/binance-personal-reconcile'

export const runtime = 'nodejs'

/**
 * How long a binance_personal transaction may sit `pending` before we expire
 * it. Deliberately much longer than Solana's 30 min: a manual transfer can
 * take a while, and rule-3 (ambiguous) payments wait in this window for the
 * admin's one-click manual confirmation — expiring early would close it.
 */
const PENDING_TTL_MINUTES = 24 * 60

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

interface PendingRow extends BinancePersonalTx {
  transaction_date: string
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || !provided || !safeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const { data: pending, error } = await admin
    .from('transactions')
    .select('transaction_id, amount, tenant_id, plan_id, transaction_date')
    .eq('payment_provider', 'binance_personal')
    .eq('status', 'pending')
    .order('transaction_date', { ascending: true })

  if (error) {
    console.error('[binance-personal-reconcile] query error', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }
  if (!pending?.length) {
    return NextResponse.json({ reconciled: 0, expired: 0, ambiguous: 0, errors: 0 })
  }

  // ONE Pay-history fetch per tenant, matched against all its pending rows.
  const byTenant = new Map<string, PendingRow[]>()
  for (const tx of pending as PendingRow[]) {
    const list = byTenant.get(tx.tenant_id) ?? []
    list.push(tx)
    byTenant.set(tx.tenant_id, list)
  }

  const ttlCutoffMs = Date.now() - PENDING_TTL_MINUTES * 60_000
  let reconciled = 0
  let expired = 0
  let ambiguous = 0
  const errors: string[] = []

  for (const [tenantId, txs] of byTenant) {
    let transfers
    try {
      const config = await loadBinancePersonalConfig(admin, tenantId)
      if (!config) {
        errors.push(`tenant ${tenantId}: binance_personal not configured`)
        continue
      }
      // Window starts at the oldest pending row for this tenant (rows are
      // sorted ascending by transaction_date above).
      const oldestMs = new Date(txs[0].transaction_date).getTime()
      transfers = await fetchTenantPayTransfers(config, oldestMs)
    } catch (err) {
      errors.push(`tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    for (const tx of txs) {
      try {
        const result = await reconcileBinancePersonalTransaction(admin, tx, transfers)
        switch (result.status) {
          case 'confirmed':
            if (!result.alreadyProcessed) reconciled++
            break
          case 'ambiguous':
            // Colliding amounts, no note code — waiting for the admin's manual
            // confirmation. Left pending (inside the TTL window).
            ambiguous++
            break
          case 'not_found': {
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
            errors.push(`tx ${tx.transaction_id}: orderId already consumed`)
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
  }

  if (errors.length) console.warn('[binance-personal-reconcile] errors:', errors)
  return NextResponse.json({ reconciled, expired, ambiguous, errors: errors.length })
}
