/**
 * Solana Pay on-chain confirmation endpoint (issue #280, Phase 5).
 *
 * Solana Pay has NO signed webhook — confirmation is on-chain. The client polls
 * this endpoint after presenting the QR. Given our `transactionId`, we:
 *   1. load the pending transaction (must belong to the caller + tenant),
 *   2. read the stored on-chain reference pubkey (provider_subscription_id),
 *   3. call SolanaProvider.confirmTransfer(reference, expectedAmount) which
 *      runs findReference + validateTransfer against the chain,
 *   4. on a validated transfer, flip the transaction → successful (the
 *      after_transaction_update trigger creates the subscription + entitlements).
 *
 * Security: there is no shared secret, but none is needed — the only way to make
 * this succeed is a REAL on-chain transfer of the exact amount to our recipient
 * carrying our unique reference key. validateTransfer enforces all three, so a
 * caller cannot fabricate a confirmation. The status='pending' guard makes the
 * flip idempotent against repeated polling.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { Connection, PublicKey } from '@solana/web3.js'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { verifySplitTransfer } from '@/lib/payments/solana-split'

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

    // Load the transaction, scoped to the caller + tenant.
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .select('transaction_id, status, amount, payment_provider, provider_subscription_id, user_id, tenant_id')
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (txError || !tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (tx.payment_provider !== 'solana') {
      return NextResponse.json({ error: 'Not a Solana transaction' }, { status: 400 })
    }

    // Idempotent: already confirmed by a prior poll.
    if (tx.status === 'successful') {
      return NextResponse.json({ confirmed: true, alreadyProcessed: true })
    }
    if (tx.status !== 'pending') {
      return NextResponse.json({ confirmed: false, status: tx.status })
    }

    const referencePubkey = tx.provider_subscription_id
    if (!referencePubkey) {
      return NextResponse.json({ error: 'Transaction has no Solana reference' }, { status: 400 })
    }

    const rpcUrl = process.env.SOLANA_RPC_URL
    const platformWallet = process.env.SOLANA_PLATFORM_WALLET
    if (!rpcUrl || !platformWallet) {
      return NextResponse.json({ error: 'Solana not configured' }, { status: 503 })
    }

    const admin = getSupabaseAdmin()

    // Resolve the same split inputs the /tx endpoint used: school wallet (per
    // tenant), platform wallet (env), split percent (revenue_splits).
    const { data: wallet } = await admin
      .from('tenant_payment_wallets')
      .select('wallet_address')
      .eq('tenant_id', tx.tenant_id)
      .eq('provider', 'solana')
      .maybeSingle()
    if (!wallet?.wallet_address) {
      return NextResponse.json({ error: 'School has not configured a Solana wallet' }, { status: 400 })
    }
    const { data: split } = await admin
      .from('revenue_splits')
      .select('platform_percentage')
      .eq('tenant_id', tx.tenant_id)
      .maybeSingle()
    const platformPercent = Number(split?.platform_percentage ?? 20)
    const usdcMint = process.env.SOLANA_USDC_MINT

    // Confirm BOTH split legs on-chain (custom verification — validateTransfer
    // only handles a single recipient).
    let result: { confirmed: boolean; signature?: string }
    try {
      result = await verifySplitTransfer({
        connection: new Connection(rpcUrl, 'confirmed'),
        reference: new PublicKey(referencePubkey),
        schoolWallet: new PublicKey(wallet.wallet_address),
        platformWallet: new PublicKey(platformWallet),
        amountMajor: Number(tx.amount),
        platformPercent,
        splToken: usdcMint ? new PublicKey(usdcMint) : undefined,
        decimals: usdcMint ? 6 : 9,
      })
    } catch (err) {
      // Found on-chain but legs don't match (wrong amount/recipient) or RPC error.
      console.error(`[solana/verify] verifySplitTransfer failed for tx ${transactionId}:`, err)
      return NextResponse.json({ error: 'On-chain validation failed' }, { status: 422 })
    }

    if (!result.confirmed) {
      // Not found on-chain yet — the client should keep polling.
      return NextResponse.json({ confirmed: false })
    }

    // Flip → successful (status-guarded for idempotency). The
    // after_transaction_update trigger creates the subscription + entitlements.
    const { error: flipErr } = await admin
      .from('transactions')
      .update({ status: 'successful' })
      .eq('transaction_id', tx.transaction_id)
      .eq('status', 'pending')

    if (flipErr) {
      console.error(`[solana/verify] failed to flip tx ${transactionId}:`, flipErr)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    console.log(`[solana/verify] confirmed tx ${transactionId} (sig ${result.signature})`)
    return NextResponse.json({ confirmed: true, signature: result.signature })
  } catch (error) {
    console.error('[solana/verify] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
