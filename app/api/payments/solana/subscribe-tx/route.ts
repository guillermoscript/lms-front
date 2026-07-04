/**
 * Solana Pay TRANSACTION-REQUEST endpoint for NATIVE auto-pull subscriptions
 * (issue #280, Phase 6 — `solana_subs`).
 *
 * The subscriptions checkout QR points here. The wallet:
 *   GET  → { label, icon }                       (shown in the wallet UI)
 *   POST { account } → { transaction, message }   (server-built SUBSCRIBE tx)
 *
 * The returned transaction is the on-chain SUBSCRIBE instruction (plus an init
 * of the SubscriptionAuthority if needed), carrying our reference pubkey so
 * findReference can locate it. Before building, we ensure the on-chain PLAN
 * exists (idempotent createPlan signed by the puller, which is also the on-chain
 * merchant / plan owner). The wallet signs once and submits.
 *
 * On-chain shape (per design):
 *   merchant   = puller pubkey (derived from SOLANA_PULLER_SECRET_KEY)
 *   planId     = BigInt(our plan_id)
 *   periodHours = plan.duration_in_days * 24
 *   amountBase = round(plan.price * 1e6)            (USDC, 6 decimals)
 *   destinations = [schoolWallet, platformWallet]
 *   pullers    = [pullerPubkey]
 *   mint       = SOLANA_USDC_MINT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PublicKey, Keypair } from '@solana/web3.js'
import { getBase58Encoder } from '@solana/kit'
import {
  ensurePlanOnChain,
  buildSubscribeTxUnsignedBase64,
  buildInitAuthorityTxUnsignedBase64,
} from '@/lib/payments/solana-subscriptions'
import { paymentAnonLimiter, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase environment variables not set')
  return createClient(url, serviceKey)
}

/** Derive the puller (= on-chain merchant) base58 pubkey from its secret key. */
function pullerPubkeyFromSecret(secretBase58: string): string {
  const secretBytes = new Uint8Array(getBase58Encoder().encode(secretBase58))
  return Keypair.fromSecretKey(secretBytes).publicKey.toBase58()
}

export async function GET() {
  return NextResponse.json({
    label: process.env.NEXT_PUBLIC_APP_NAME || 'LMS',
    icon: `${process.env.NEXT_PUBLIC_APP_URL || ''}/favicon.ico`,
  })
}

export async function POST(req: NextRequest) {
  try {
    // No session (hit directly by wallet apps) — rate limit by IP.
    try {
      await paymentAnonLimiter.check(30, getClientIp(req))
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // The random on-chain reference pubkey (NOT the sequential transaction_id) —
    // unguessable, so the tx lookup below cannot be hijacked by id enumeration.
    const reference = req.nextUrl.searchParams.get('reference')
    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 })
    }

    const { account } = await req.json()
    if (!account) {
      return NextResponse.json({ error: 'Missing account' }, { status: 400 })
    }
    // Validate the subscriber pubkey.
    try {
       
      new PublicKey(account)
    } catch {
      return NextResponse.json({ error: 'Invalid account' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Load the pending transaction by its random reference pubkey (stored as
    // provider_subscription_id at checkout) — unguessable, unlike transaction_id.
    const { data: tx } = await admin
      .from('transactions')
      .select('transaction_id, status, amount, tenant_id, plan_id, payment_provider, provider_subscription_id')
      .eq('provider_subscription_id', reference)
      .maybeSingle()

    if (!tx || tx.payment_provider !== 'solana_subs') {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }
    if (tx.status !== 'pending') {
      return NextResponse.json({ error: 'Transaction is not payable' }, { status: 409 })
    }
    if (!tx.plan_id) {
      return NextResponse.json({ error: 'Subscription transaction has no plan' }, { status: 400 })
    }
    const referencePubkey = tx.provider_subscription_id
    if (!referencePubkey) {
      return NextResponse.json({ error: 'Transaction has no Solana reference' }, { status: 400 })
    }

    // Plan terms: duration → periodHours, price → amountBase. Scope the lookup
    // to the transaction's tenant (M2) — plan_id is a global PK so it can't
    // collide across tenants, but the explicit filter keeps the mandatory
    // tenant-scoping invariant and fails closed on any cross-tenant drift.
    const { data: plan } = await admin
      .from('plans')
      .select('duration_in_days, price')
      .eq('plan_id', tx.plan_id)
      .eq('tenant_id', tx.tenant_id)
      .maybeSingle()
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    // School wallet (per tenant).
    const { data: wallet } = await admin
      .from('tenant_payment_wallets')
      .select('wallet_address')
      .eq('tenant_id', tx.tenant_id)
      .eq('provider', 'solana_subs')
      .maybeSingle()
    if (!wallet?.wallet_address) {
      return NextResponse.json({ error: 'School has not configured a Solana wallet' }, { status: 400 })
    }

    // Required env (all four).
    const rpcUrl = process.env.SOLANA_RPC_URL
    const pullerSecret = process.env.SOLANA_PULLER_SECRET_KEY
    const platformWallet = process.env.SOLANA_PLATFORM_WALLET
    const mint = process.env.SOLANA_USDC_MINT
    if (!rpcUrl || !pullerSecret || !platformWallet || !mint) {
      return NextResponse.json({ error: 'Solana subscriptions not configured' }, { status: 503 })
    }

    const merchant = pullerPubkeyFromSecret(pullerSecret)
    const planId = BigInt(tx.plan_id)
    const durationDays = Number((plan as { duration_in_days?: number }).duration_in_days ?? 0)
    const price = Number((plan as { price?: number }).price ?? 0)

    // Capture the subscriber wallet now (the wallet scans the QR off-device, so
    // the web page polling /verify never learns it). /verify reads it back from
    // provider_metadata to confirm the delegation + fire the first charge.
    // WRITE-ONCE (M4): only set it while provider_metadata is still null, so a
    // racing caller who knows the reference can't overwrite the subscriber after
    // the legitimate wallet has been captured.
    await admin
      .from('transactions')
      .update({ provider_metadata: { subscriber: account } })
      .eq('transaction_id', tx.transaction_id)
      .is('provider_metadata', null)

    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'LMS'

    // STEP 1 (first-time subscribers only): the SubscriptionAuthority must be
    // created in its OWN confirmed transaction before subscribe — a bundled
    // init+subscribe always fails with STALE_SUBSCRIPTION_AUTHORITY (136),
    // because the authority's init_id is the execution slot and subscribe can't
    // pass a matching value at build time. If the authority is missing, return
    // the init tx; the wallet signs + confirms it, then calls again for subscribe.
    const initTx = await buildInitAuthorityTxUnsignedBase64({
      rpcUrl,
      subscriber: account,
      mint,
    })
    if (initTx) {
      return NextResponse.json({
        transaction: initTx,
        step: 'init',
        message: `${appName} — initialize subscription wallet`,
      })
    }

    // STEP 2: authority exists. Ensure the on-chain plan exists (idempotent;
    // puller = merchant/owner), then build the unsigned SUBSCRIBE tx carrying
    // our reference pubkey so findReference can locate it.
    await ensurePlanOnChain({
      rpcUrl,
      pullerSecretKeyBase58: pullerSecret,
      planId,
      mint,
      amountBase: BigInt(Math.round(price * 1e6)),
      periodHours: BigInt(durationDays * 24),
      destinations: [wallet.wallet_address, platformWallet],
      pullers: [merchant],
    })

    const transaction = await buildSubscribeTxUnsignedBase64({
      rpcUrl,
      subscriber: account,
      merchant,
      planId,
      mint,
      reference: referencePubkey,
    })

    return NextResponse.json({
      transaction,
      step: 'subscribe',
      message: `${appName} — subscribe ${tx.transaction_id}`,
    })
  } catch (error) {
    console.error('[solana/subscribe-tx] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
