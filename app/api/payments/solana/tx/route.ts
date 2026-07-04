/**
 * Solana Pay TRANSACTION-REQUEST endpoint (issue #280 — fee split).
 *
 * The Solana checkout QR points here (a `solana:<link>` URL). The wallet:
 *   GET  → { label, icon }                     (shown in the wallet UI)
 *   POST { account } → { transaction, message } (server-built split tx)
 *
 * The returned transaction has TWO transfers — school share + platform fee —
 * built from the pending transaction's amount, the tenant's school wallet
 * (tenant_payment_wallets), the platform wallet (env), and the tenant's
 * revenue_splits.platform_percentage. The wallet signs once; the runtime
 * executes both atomically.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Connection, PublicKey } from '@solana/web3.js'
import { buildSplitTransaction } from '@/lib/payments/solana-split'

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
    const reference = req.nextUrl.searchParams.get('reference') // our transaction_id
    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 })
    }

    const { account } = await req.json()
    if (!account) {
      return NextResponse.json({ error: 'Missing account' }, { status: 400 })
    }
    let payer: PublicKey
    try {
      payer = new PublicKey(account)
    } catch {
      return NextResponse.json({ error: 'Invalid account' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Load the pending transaction: amount, tenant, on-chain reference pubkey,
    // and the settlement LOCKED at checkout (currency/base/mint).
    const { data: tx } = await admin
      .from('transactions')
      .select('transaction_id, status, amount, tenant_id, payment_provider, provider_subscription_id, settlement_currency, settlement_base, settlement_mint')
      .eq('transaction_id', reference)
      .maybeSingle()

    if (!tx || tx.payment_provider !== 'solana') {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }
    if (tx.status !== 'pending') {
      return NextResponse.json({ error: 'Transaction is not payable' }, { status: 409 })
    }
    const referencePubkey = tx.provider_subscription_id
    if (!referencePubkey) {
      return NextResponse.json({ error: 'Transaction has no Solana reference' }, { status: 400 })
    }

    // School wallet (per tenant) + platform wallet (env) + split percent.
    const { data: wallet } = await admin
      .from('tenant_payment_wallets')
      .select('wallet_address')
      .eq('tenant_id', tx.tenant_id)
      .eq('provider', 'solana')
      .maybeSingle()
    if (!wallet?.wallet_address) {
      return NextResponse.json({ error: 'School has not configured a Solana wallet' }, { status: 400 })
    }
    const platformWalletStr = process.env.SOLANA_PLATFORM_WALLET
    if (!platformWalletStr) {
      return NextResponse.json({ error: 'Platform wallet not configured' }, { status: 503 })
    }

    const { data: split } = await admin
      .from('revenue_splits')
      .select('platform_percentage')
      .eq('tenant_id', tx.tenant_id)
      .maybeSingle()
    const platformPercent = Number(split?.platform_percentage ?? 20)

    const rpcUrl = process.env.SOLANA_RPC_URL
    if (!rpcUrl) {
      return NextResponse.json({ error: 'Solana RPC not configured' }, { status: 503 })
    }

    // Use the settlement LOCKED at checkout (amount + token). Never re-quote: a
    // native-SOL amount was converted from the USD price at checkout-time rate,
    // which has since moved. Legacy rows without a lock fall back to env+price.
    let totalBase: number | undefined
    let splTokenStr: string | null
    let decimals: number
    if (tx.settlement_base != null && tx.settlement_currency) {
      totalBase = Number(tx.settlement_base)
      splTokenStr = tx.settlement_mint
      decimals = tx.settlement_currency === 'usdc' ? 6 : 9
    } else {
      const usdcMint = process.env.SOLANA_USDC_MINT
      splTokenStr = usdcMint || null
      decimals = usdcMint ? 6 : 9
    }

    const base64 = await buildSplitTransaction({
      connection: new Connection(rpcUrl, 'confirmed'),
      payer,
      schoolWallet: new PublicKey(wallet.wallet_address),
      platformWallet: new PublicKey(platformWalletStr),
      amountMajor: totalBase == null ? Number(tx.amount) : undefined,
      totalBase,
      platformPercent,
      reference: new PublicKey(referencePubkey),
      splToken: splTokenStr ? new PublicKey(splTokenStr) : undefined,
      decimals,
    })

    return NextResponse.json({
      transaction: base64,
      message: `${process.env.NEXT_PUBLIC_APP_NAME || 'LMS'} — order ${reference}`,
    })
  } catch (error) {
    console.error('[solana/tx] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
