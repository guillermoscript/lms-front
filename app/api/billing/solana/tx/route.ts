/**
 * Solana Pay TRANSACTION-REQUEST endpoint for school → platform billing (#610).
 *
 * The upgrade page's QR points here (a `solana:<link>` URL). The wallet:
 *   GET  → { label, icon }                      (shown in the wallet UI)
 *   POST { account } → { transaction, message } (server-built transfer)
 *
 * The twin of `app/api/payments/solana/tx` with the split removed: the platform
 * is the payee, so there is one recipient and no `revenue_splits` leg. The
 * amount is the one LOCKED on the pending request at checkout, never a fresh
 * quote — see lib/billing/solana-platform-payment.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PublicKey } from '@solana/web3.js'
import {
  buildPlatformTransfer,
  getPlatformSolanaConfig,
  resolveStoredSettlement,
} from '@/lib/billing/solana-platform-payment'
import { isRequestOpen } from '@/lib/billing/payment-request-ttl'
import { paymentAnonLimiter, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase environment variables not set')
  return createClient(url, serviceKey)
}

export async function GET() {
  return NextResponse.json({
    label: process.env.NEXT_PUBLIC_APP_NAME || 'LMS',
    icon: `${process.env.NEXT_PUBLIC_APP_URL || ''}/favicon.ico`,
  })
}

export async function POST(req: NextRequest) {
  try {
    // Hit directly by wallet apps, so there is no session to scope by — rate
    // limit by IP, as the student twin does.
    try {
      await paymentAnonLimiter.check(30, getClientIp(req))
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // The random reference pubkey, NOT request_id: this endpoint is called
    // without authentication, and a guessable key would let anyone enumerate
    // other schools' pending plan purchases and amounts.
    const reference = req.nextUrl.searchParams.get('reference')
    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 })
    }

    const { account } = await req.json()
    if (!account) {
      return NextResponse.json({ error: 'Missing account' }, { status: 400 })
    }
    let payer: PublicKey
    let referenceKey: PublicKey
    try {
      payer = new PublicKey(account)
      referenceKey = new PublicKey(reference)
    } catch {
      return NextResponse.json({ error: 'Invalid account' }, { status: 400 })
    }

    const config = getPlatformSolanaConfig()
    if (!config) {
      return NextResponse.json({ error: 'Solana is not configured' }, { status: 503 })
    }

    const admin = getSupabaseAdmin()
    const { data: request } = await admin
      .from('platform_payment_requests')
      .select(
        'request_id, tenant_id, status, expires_at, payment_provider, provider_charge_id, activation_state, settlement_currency, settlement_base, settlement_mint',
      )
      .eq('provider_reference', reference)
      .maybeSingle()

    if (!request || request.payment_provider !== 'solana') {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }
    // Once a transfer is observed, the durable activation worker owns recovery.
    // Never build a second wallet transaction for the same request/reference.
    if (request.provider_charge_id || request.activation_state) {
      return NextResponse.json({ error: 'This payment has already been observed' }, { status: 409 })
    }
    // A lapsed request stops being payable the moment its TTL passes, whether
    // or not the expiry cron has swept it yet (#546) — otherwise a stale QR
    // left open in a wallet could still buy a period at a price we withdrew.
    if (!isRequestOpen(request as { status: string; expires_at: string | null })) {
      return NextResponse.json({ error: 'This payment request is no longer payable' }, { status: 409 })
    }

    const settlement = resolveStoredSettlement(request)
    if (!settlement) {
      return NextResponse.json({ error: 'Payment request has no settlement amount' }, { status: 400 })
    }

    const transaction = await buildPlatformTransfer({
      config,
      payer,
      reference: referenceKey,
      settlement,
    })

    return NextResponse.json({
      transaction,
      message: `${process.env.NEXT_PUBLIC_APP_NAME || 'LMS'} — plan payment`,
    })
  } catch (error) {
    console.error('[billing/solana/tx] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
