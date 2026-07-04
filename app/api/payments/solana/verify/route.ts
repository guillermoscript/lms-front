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
import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import { getBase58Encoder } from '@solana/kit'
import { findReference, FindReferenceError } from '@solana/pay'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { verifySplitTransfer } from '@/lib/payments/solana-split'
import {
  deriveSubscriptionPda,
  getSubscriptionState,
} from '@/lib/payments/solana-subscriptions'
import { pullSplitForSubscription } from '@/lib/payments/solana-subscription-pull'
import { paymentPollLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase environment variables not set')
  return createAdminSupabase(url, serviceKey)
}

/** Derive the puller (= on-chain merchant) base58 pubkey from its secret key. */
function pullerPubkeyFromSecret(secretBase58: string): string {
  const secretBytes = new Uint8Array(getBase58Encoder().encode(secretBase58))
  return Keypair.fromSecretKey(secretBytes).publicKey.toBase58()
}

export async function POST(req: NextRequest) {
  try {
    const { transactionId, subscriber } = await req.json()
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
      await paymentPollLimiter.check(60, user.id)
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Load the transaction, scoped to the caller + tenant.
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .select('transaction_id, status, amount, payment_provider, provider_subscription_id, user_id, tenant_id, plan_id, provider_metadata, settlement_currency, settlement_base, settlement_mint')
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (txError || !tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (tx.payment_provider !== 'solana' && tx.payment_provider !== 'solana_subs') {
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

    // -----------------------------------------------------------------------
    // Native auto-pull subscriptions branch (solana_subs).
    // The reference pubkey marks the SUBSCRIBE tx. We confirm it landed
    // (findReference), confirm the on-chain SubscriptionDelegation exists for
    // the (merchant, planId, subscriber), then flip the tx → successful (the
    // trigger creates the subscription row), persist on-chain metadata, and
    // fire the FIRST split charge.
    // -----------------------------------------------------------------------
    if (tx.payment_provider === 'solana_subs') {
      // Prefer the subscriber captured server-side at subscribe time (the web
      // page polling here never learns it); fall back to a client-supplied one.
      const storedSubscriber = (tx.provider_metadata as { subscriber?: string } | null)?.subscriber
      return await handleSolanaSubsVerify(tx, storedSubscriber ?? subscriber)
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

    // Verify against the settlement LOCKED at checkout (amount + token), so a
    // native-SOL payment is checked against the exact lamports quoted then — the
    // SOL/USD rate has moved since. Legacy rows fall back to env + USD amount.
    let vTotalBase: number | undefined
    let vSplTokenStr: string | null
    let vDecimals: number
    if (tx.settlement_base != null && tx.settlement_currency) {
      vTotalBase = Number(tx.settlement_base)
      vSplTokenStr = tx.settlement_mint
      vDecimals = tx.settlement_currency === 'usdc' ? 6 : 9
    } else {
      const usdcMint = process.env.SOLANA_USDC_MINT
      vSplTokenStr = usdcMint || null
      vDecimals = usdcMint ? 6 : 9
    }

    // Confirm BOTH split legs on-chain (custom verification — validateTransfer
    // only handles a single recipient).
    let result: { confirmed: boolean; signature?: string }
    try {
      result = await verifySplitTransfer({
        connection: new Connection(rpcUrl, 'confirmed'),
        reference: new PublicKey(referencePubkey),
        schoolWallet: new PublicKey(wallet.wallet_address),
        platformWallet: new PublicKey(platformWallet),
        amountMajor: vTotalBase == null ? Number(tx.amount) : undefined,
        totalBase: vTotalBase,
        platformPercent,
        splToken: vSplTokenStr ? new PublicKey(vSplTokenStr) : undefined,
        decimals: vDecimals,
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

    // Flip → successful (status-guarded for idempotency). We also CONSUME the
    // on-chain signature via provider_charge_id: the partial-unique index
    // (transactions_provider_charge_id_unique) guarantees a given signature
    // backs only one successful transaction, so one payment carrying multiple
    // reference keys cannot confirm multiple orders (H1). The
    // after_transaction_update trigger creates the subscription + entitlements.
    const { data: flipped, error: flipErr } = await admin
      .from('transactions')
      .update({ status: 'successful', provider_charge_id: result.signature })
      .eq('transaction_id', tx.transaction_id)
      .eq('status', 'pending')
      .select('transaction_id')
      .maybeSingle()

    if (flipErr) {
      // 23505 = this signature already backs another successful transaction —
      // a replay of one on-chain payment against a second order. Reject it.
      if ((flipErr as { code?: string }).code === '23505') {
        console.warn(`[solana/verify] signature ${result.signature} already consumed by another transaction`)
        return NextResponse.json(
          { error: 'This on-chain payment was already used for another order' },
          { status: 409 },
        )
      }
      console.error(`[solana/verify] failed to flip tx ${transactionId}:`, flipErr)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    if (!flipped) {
      // A concurrent/earlier verify already confirmed this transaction (idempotency
      // guard matched 0 rows). Report success without implying we just did the work.
      console.log(`[solana/verify] tx ${transactionId} was already confirmed`)
      return NextResponse.json({ confirmed: true, alreadyProcessed: true })
    }

    console.log(`[solana/verify] confirmed tx ${transactionId} (sig ${result.signature})`)
    return NextResponse.json({ confirmed: true, signature: result.signature })
  } catch (error) {
    console.error('[solana/verify] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface SolanaSubsTx {
  transaction_id: number | string
  status: string
  amount: number
  tenant_id: string
  plan_id: number | string | null
  provider_subscription_id: string | null
  provider_metadata?: { subscriber?: string } | null
}

/**
 * Confirm a native auto-pull subscription (solana_subs) and fire its first
 * charge. The reference pubkey (provider_subscription_id) marks the SUBSCRIBE
 * tx; the subscriber pubkey comes from the client body and is proven on-chain
 * via getSubscriptionState (the delegation can only exist if that subscriber
 * actually subscribed). Idempotency is guarded by the status='pending' flip.
 */
async function handleSolanaSubsVerify(
  tx: SolanaSubsTx,
  subscriber: unknown,
): Promise<NextResponse> {
  if (!subscriber || typeof subscriber !== 'string') {
    return NextResponse.json({ error: 'Missing subscriber' }, { status: 400 })
  }
  try {
     
    new PublicKey(subscriber)
  } catch {
    return NextResponse.json({ error: 'Invalid subscriber' }, { status: 400 })
  }

  if (!tx.plan_id) {
    return NextResponse.json({ error: 'Subscription transaction has no plan' }, { status: 400 })
  }
  const referencePubkey = tx.provider_subscription_id
  if (!referencePubkey) {
    return NextResponse.json({ error: 'Transaction has no Solana reference' }, { status: 400 })
  }

  const rpcUrl = process.env.SOLANA_RPC_URL
  const pullerSecret = process.env.SOLANA_PULLER_SECRET_KEY
  const platformWallet = process.env.SOLANA_PLATFORM_WALLET
  const mint = process.env.SOLANA_USDC_MINT
  if (!rpcUrl || !pullerSecret || !platformWallet || !mint) {
    return NextResponse.json({ error: 'Solana subscriptions not configured' }, { status: 503 })
  }

  const merchant = pullerPubkeyFromSecret(pullerSecret)
  const planId = BigInt(tx.plan_id)
  const admin = getSupabaseAdmin()

  // 1. Confirm the SUBSCRIBE tx landed (findReference on the reference pubkey).
  try {
    await findReference(new Connection(rpcUrl, 'confirmed'), new PublicKey(referencePubkey), {
      finality: 'confirmed',
    })
  } catch (err) {
    if (err instanceof FindReferenceError) {
      // Not found on-chain yet — the client should keep polling.
      return NextResponse.json({ confirmed: false })
    }
    console.error(`[solana/verify] findReference failed for tx ${tx.transaction_id}:`, err)
    return NextResponse.json({ error: 'On-chain validation failed' }, { status: 422 })
  }

  // 2. Confirm the on-chain SubscriptionDelegation exists for this subscriber.
  const state = await getSubscriptionState({ rpcUrl, merchant, planId, subscriber })
  if (!state) {
    // Subscribe tx seen but delegation not yet readable — keep polling.
    return NextResponse.json({ confirmed: false })
  }

  // 3. The stable match key for renewals = the on-chain SubscriptionDelegation PDA.
  const subscriptionPda = await deriveSubscriptionPda(merchant, planId, subscriber)

  // 4. Flip → successful (status-guarded). The after_transaction_update trigger
  //    creates the subscription row, copying provider_subscription_id +
  //    payment_provider via handle_new_subscription.
  const { data: flipped, error: flipErr } = await admin
    .from('transactions')
    .update({ status: 'successful', provider_subscription_id: subscriptionPda })
    .eq('transaction_id', tx.transaction_id)
    .eq('status', 'pending')
    .select('transaction_id')
    .maybeSingle()
  if (flipErr) {
    console.error(`[solana/verify] failed to flip solana_subs tx ${tx.transaction_id}:`, flipErr)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
  if (!flipped) {
    // A concurrent/earlier verify already confirmed this transaction. Return before
    // the on-chain pull below so we never submit a second auto-pull transfer.
    console.log(`[solana/verify] solana_subs tx ${tx.transaction_id} was already confirmed`)
    return NextResponse.json({ confirmed: true, alreadyProcessed: true })
  }

  // School wallet (per tenant) + revenue split percent.
  const { data: wallet } = await admin
    .from('tenant_payment_wallets')
    .select('wallet_address')
    .eq('tenant_id', tx.tenant_id)
    .eq('provider', 'solana_subs')
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

  // 5. Persist on-chain metadata on the subscription row (created by the trigger)
  //    so the crank cron can resolve the on-chain coordinates each period.
  await admin
    .from('subscriptions')
    .update({
      provider_metadata: { subscriber, merchant, planId: String(planId), mint },
    })
    .eq('provider_subscription_id', subscriptionPda)
    .eq('payment_provider', 'solana_subs')

  // 6. FIRST charge: the split pull (school then platform).
  try {
    await pullSplitForSubscription({
      rpcUrl,
      pullerSecretKeyBase58: pullerSecret,
      subscriber,
      merchant,
      planId,
      mint,
      schoolWallet: wallet.wallet_address,
      platformWallet,
      priceMajor: Number(tx.amount),
      platformPercent,
    })
  } catch (err) {
    // The subscription is confirmed even if the first crank pull is delayed; the
    // crank cron will retry. Log and still report confirmed.
    console.error(`[solana/verify] first pull failed for tx ${tx.transaction_id}:`, err)
  }

  console.log(`[solana/verify] confirmed solana_subs tx ${tx.transaction_id} (sub PDA ${subscriptionPda})`)
  return NextResponse.json({ confirmed: true })
}
