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
import { reconcileSolanaOneTimeTransaction } from '@/lib/payments/solana-reconcile'
import {
  deriveSubscriptionPda,
  getSubscriptionState,
} from '@/lib/payments/solana-subscriptions'
import { pullSplitForSubscription } from '@/lib/payments/solana-subscription-pull'
import { paymentPollLimiter } from '@/lib/rate-limit'
import { netOfRefunds } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track, safeAnalytics } from '@/lib/analytics/server'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase environment variables not set')
  return createAdminSupabase(url, serviceKey)
}

/**
 * Shape of the transaction row the settlement events read. Deliberately a
 * structural type: both branches below already hold the row, and re-reading it
 * for analytics on a poll endpoint would multiply DB load by the polling rate.
 */
type SettledTx = {
  transaction_id: number | string
  user_id?: string | null
  tenant_id?: string | null
  amount?: number | null
  currency?: string | null
  refunded_amount?: number | null
  school_percentage_snapshot?: number | null
  plan_id?: number | string | null
  product_id?: number | string | null
  settlement_currency?: string | null
}

/**
 * Loop C settlement, fired exactly once per confirmed on-chain payment.
 *
 * Every caller gates this on the status-guarded flip having landed, which is
 * what keeps a polling client — this endpoint is hit repeatedly by design —
 * from emitting one `payment_succeeded` per poll.
 *
 * Money is NET of refunds (#547) and denominated in the sale's own currency,
 * NOT in `settlement_base`: lamports and USDC base units are what the chain is
 * verified against and are meaningless summed next to a Stripe sale.
 *
 * Wrapped whole: the `entitlements` count below is an analytics-only read, and
 * both callers `await` this on the request path of a confirmed on-chain
 * payment. An unguarded throw there would 500 a settlement that already landed.
 */
async function trackSolanaSettlement(
  tx: SettledTx,
  provider: 'solana' | 'solana_subs',
  extra: Record<string, unknown> = {},
): Promise<void> {
  return safeAnalytics(async () => {
    const gross = Number(tx.amount ?? 0)
    const net = netOfRefunds(gross, tx.refunded_amount)
    const snapshot = tx.school_percentage_snapshot ?? null
    const bearsFee = !!PROVIDER_CAPABILITIES[provider as PaymentProvider]?.bearsPlatformFee
    const ctx = { userId: tx.user_id, tenantId: tx.tenant_id }

    await track(
      ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
      {
        provider,
        amount_major: net,
        currency: tx.currency ?? 'usd',
        is_subscription: !!tx.plan_id,
        // WHETHER a fee is taken is the capability; the RATE is the row's own
        // snapshot (#547). No snapshot → omit the figure rather than invent one.
        ...(bearsFee
          ? snapshot != null
            ? { platform_fee: Math.round(net * (100 - Number(snapshot))) / 100 }
            : {}
          : { platform_fee: 0 }),
        school_percentage_snapshot: snapshot,
        gross_amount: gross,
        transaction_id: tx.transaction_id,
        settlement_currency: tx.settlement_currency ?? null,
        ...(tx.plan_id ? { plan_id: tx.plan_id } : {}),
        ...(tx.product_id ? { product_id: tx.product_id } : {}),
        ...extra,
      },
      ctx,
    )

    const sourceType = tx.plan_id ? 'subscription' : 'product'
    const sourceId = tx.plan_id ?? tx.product_id
    if (tx.user_id && sourceId != null) {
      const { count } = await getSupabaseAdmin()
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
          provider,
          transaction_id: tx.transaction_id,
        },
        ctx,
      )
    }
  }, `solana settlement analytics (${provider})`)
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
      // `currency`, `refunded_amount`, `product_id` and the split snapshot are
      // here only so the settlement events below are net-of-refunds and
      // fee-accurate without a second read (#547). Solana settles with no
      // browser and no webhook, so THIS is the only place the sale is observable.
      .select('transaction_id, status, amount, currency, refunded_amount, school_percentage_snapshot, payment_provider, provider_subscription_id, user_id, tenant_id, plan_id, product_id, provider_metadata, settlement_currency, settlement_base, settlement_mint')
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

    // Confirm on-chain + flip → successful via the shared reconcile core (the
    // same logic the /api/cron/solana-reconcile backstop runs, #467).
    const admin = getSupabaseAdmin()
    const result = await reconcileSolanaOneTimeTransaction(admin, tx)

    switch (result.status) {
      case 'confirmed':
        // `alreadyProcessed` means an earlier poll (or the reconcile cron) owns
        // the settlement and already emitted it.
        if (!result.alreadyProcessed) {
          await trackSolanaSettlement(tx, 'solana', { signature: result.signature ?? null })
        }
        return NextResponse.json(
          result.alreadyProcessed
            ? { confirmed: true, alreadyProcessed: true }
            : { confirmed: true, signature: result.signature },
        )
      case 'not_found':
        // Not found on-chain yet — the client should keep polling.
        return NextResponse.json({ confirmed: false })
      case 'validation_error':
        return NextResponse.json({ error: 'On-chain validation failed' }, { status: 422 })
      case 'replayed':
        return NextResponse.json(
          { error: 'This on-chain payment was already used for another order' },
          { status: 409 },
        )
      case 'config_error':
        // Missing RPC/platform wallet is a server-config gap (503); a missing
        // tenant wallet or reference is a bad-request condition (400).
        return NextResponse.json(
          { error: result.message },
          { status: result.message === 'Solana not configured' ? 503 : 400 },
        )
      default:
        return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }
  } catch (error) {
    console.error('[solana/verify] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface SolanaSubsTx extends SettledTx {
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

  // The subscription is real the moment the flip lands — the trigger has
  // created the row and its entitlements. Emitted here rather than after the
  // first split pull below, which is explicitly allowed to fail and be retried
  // by the crank without the subscription being any less sold.
  await trackSolanaSettlement(tx, 'solana_subs', {
    is_renewal: false,
    subscription_pda: subscriptionPda,
  })

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
