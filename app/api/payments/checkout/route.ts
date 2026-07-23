/**
 * Unified, provider-agnostic checkout entry point (issue #280, Phase 4 + 5).
 *
 * Given a planId or productId, this route:
 *   1. resolves the row's `payment_provider`,
 *   2. inserts a pending `transaction` (our correlation id = transaction_id),
 *   3. calls `provider.createCheckoutSession(...)`,
 *   4. returns the provider-agnostic `CheckoutSession` (kind + url/clientSecret).
 *
 * The client branches on `session.kind`:
 *   - 'redirect'      → window.location = url  (Lemon Squeezy hosted checkout)
 *   - 'qr'            → render `url` as a QR; poll /api/payments/solana/verify
 *   - 'client_secret' → confirm with Stripe Elements (not handled here today)
 *
 * Scope: this route owns Lemon Squeezy + Solana. Stripe keeps its dedicated
 * Connect flow (/api/stripe/create-payment-intent) for customer creation +
 * revenue split; `manual` uses the offline payment-request flow. Both are
 * rejected here so there is exactly one creation path per provider.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getPaymentProvider } from '@/lib/payments'
import type { CreateCheckoutParams, PaymentProvider } from '@/lib/payments/types'
import { getSolUsdPrice, usdToLamports } from '@/lib/payments/sol-price'
import { getSolanaSettlementOptions } from '@/app/actions/admin/settings'
import { paymentAuthLimiter } from '@/lib/rate-limit'
import {
  findConflictingSubscription,
  PARALLEL_SUBSCRIPTION_CODE,
  PARALLEL_SUBSCRIPTION_MESSAGE,
} from '@/lib/payments/subscription-guard'

// Providers whose checkout this route owns. Stripe + manual have their own paths.
const HANDLED: PaymentProvider[] = ['lemonsqueezy', 'solana', 'solana_subs', 'paypal', 'binance']

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { planId, productId, solanaCurrency } = await req.json()
    if (!planId && !productId) {
      return NextResponse.json({ error: 'Missing plan or product ID' }, { status: 400 })
    }

    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await paymentAuthLimiter.check(10, user.id)
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Parallel-subscription guard (#459): a different plan would create a
    // second live subscription billing alongside the current one. Blocked
    // before any pending transaction / provider session exists. Same-plan
    // checkout (renewal) passes through.
    if (planId) {
      const conflict = await findConflictingSubscription(supabase, {
        userId: user.id,
        tenantId,
        planId: Number(planId),
      })
      if (conflict) {
        return NextResponse.json(
          { error: PARALLEL_SUBSCRIPTION_MESSAGE, code: PARALLEL_SUBSCRIPTION_CODE },
          { status: 409 },
        )
      }
    }

    // Resolve price + provider from the plan / product (tenant-scoped).
    let amountMajor: number
    let currency = 'usd'
    let itemName: string
    let providerSlug: string
    let providerPriceId = ''
    const mode: CreateCheckoutParams['mode'] = planId ? 'subscription' : 'one_time'

    if (planId) {
      const { data: plan, error } = await supabase
        .from('plans')
        .select('price, plan_name, currency, provider_price_id, payment_provider')
        .eq('plan_id', planId)
        .eq('tenant_id', tenantId)
        .single()
      if (error || !plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
      }
      amountMajor = Number(plan.price)
      currency = plan.currency || 'usd'
      itemName = plan.plan_name
      providerSlug = plan.payment_provider || 'stripe'
      providerPriceId = plan.provider_price_id || ''
    } else {
      const { data: product, error } = await supabase
        .from('products')
        .select('price, name, currency, provider_price_id, payment_provider')
        .eq('product_id', productId)
        .eq('tenant_id', tenantId)
        .single()
      if (error || !product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }
      amountMajor = Number(product.price)
      currency = product.currency || 'usd'
      itemName = product.name
      providerSlug = product.payment_provider || 'stripe'
      providerPriceId = product.provider_price_id || ''
    }

    if (!HANDLED.includes(providerSlug as PaymentProvider)) {
      return NextResponse.json(
        { error: `Provider '${providerSlug}' is not handled by this route` },
        { status: 400 },
      )
    }

    // Lemon Squeezy needs the variant id (stored as provider_price_id).
    if (providerSlug === 'lemonsqueezy' && !providerPriceId) {
      return NextResponse.json(
        { error: 'Lemon Squeezy plan/product is missing its variant id (provider_price_id)' },
        { status: 400 },
      )
    }

    // PayPal subscriptions bill against a Billing Plan (auto-created with the
    // plan when PayPal is configured; stored as provider_price_id).
    if (providerSlug === 'paypal' && mode === 'subscription' && !providerPriceId) {
      return NextResponse.json(
        { error: 'PayPal plan is missing its Billing Plan id (provider_price_id)' },
        { status: 400 },
      )
    }

    // One-time Solana: the student chooses the settlement token (SOL or USDC),
    // both honoring the USD price. USDC is a 1:1 USD stablecoin; native SOL is
    // converted from the USD price at the LIVE rate NOW and LOCKED — the rate
    // moves before on-chain confirmation, so /tx and /verify must use this
    // stored amount, never re-quote. (solana_subs is USDC-only, unchanged.)
    let settlement:
      | { currency: 'sol' | 'usdc'; base: number; mint: string | null; solUsd: number | null }
      | null = null
    if (providerSlug === 'solana') {
      // USDC is always offered when a mint is configured (USD-stable); native
      // SOL only when the school opted in (volatile, converted at live rate).
      const opts = await getSolanaSettlementOptions()
      const choice = (solanaCurrency as string) || (opts.usdc ? 'usdc' : 'sol')
      if (choice === 'usdc') {
        if (!opts.usdc) {
          return NextResponse.json({ error: 'USDC payments are not available' }, { status: 400 })
        }
        settlement = {
          currency: 'usdc',
          base: Math.round(amountMajor * 1e6),
          mint: process.env.SOLANA_USDC_MINT as string,
          solUsd: null,
        }
      } else if (choice === 'sol') {
        if (!opts.sol) {
          return NextResponse.json({ error: 'This school does not accept native SOL' }, { status: 400 })
        }
        let rate: number
        try {
          rate = await getSolUsdPrice()
        } catch (err) {
          console.error('[payments/checkout] SOL/USD price unavailable:', err)
          return NextResponse.json({ error: 'Could not price SOL right now — try again' }, { status: 503 })
        }
        settlement = { currency: 'sol', base: usdToLamports(amountMajor, rate), mint: null, solUsd: rate }
      } else {
        return NextResponse.json({ error: 'Invalid Solana currency' }, { status: 400 })
      }
    }

    // 1. Pending transaction — our correlation id (transaction_id) round-trips
    //    back on the webhook (LS) or the verify endpoint (Solana).
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        tenant_id: tenantId,
        plan_id: planId || null,
        product_id: productId || null,
        amount: amountMajor,
        currency,
        status: 'pending',
        payment_provider: providerSlug,
        ...(settlement
          ? {
              settlement_currency: settlement.currency,
              settlement_base: settlement.base,
              settlement_mint: settlement.mint,
              settlement_sol_usd: settlement.solUsd,
            }
          : {}),
      })
      .select('transaction_id')
      .single()

    if (txError || !transaction) {
      console.error('[payments/checkout] transaction insert failed:', txError)
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
    }

    const reference = transaction.transaction_id.toString()
    // Derive the tenant's own origin from the request rather than the single
    // global NEXT_PUBLIC_APP_URL — this route is hit on the school's subdomain,
    // and Solana Pay tx-request links must round-trip back to that same host
    // (a QR built with the wrong tenant's origin fails for every other tenant).
    //
    // req.nextUrl.origin does NOT reflect the incoming Host header in dev — it
    // resolves to the Next.js dev server's own bind address (localhost:PORT)
    // regardless of which tenant subdomain the request actually came in on.
    // Confirmed live via #479: a PayPal checkout on code-academy.lvh.me built
    // its return_url from req.nextUrl.origin, sending the buyer back to
    // localhost:3000/checkout/success after approval — a different origin than
    // their session cookie, which bounced them to /auth/login despite the
    // purchase having succeeded. Trust the Host header instead, same pattern
    // as app/api/stripe/connect/route.ts.
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
    const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
    const appUrl = `${proto}://${host}`

    try {
      const provider = getPaymentProvider(providerSlug as PaymentProvider)
      // Amount in the provider's expected unit (LS → cents; Solana → decimal).
      const amount = provider.convertAmount(amountMajor, 'major')

      const session = await provider.createCheckoutSession!({
        mode,
        providerPriceId,
        amount,
        currency,
        reference,
        successUrl: `${appUrl}/checkout/success?transactionId=${transaction.transaction_id}`,
        cancelUrl: planId ? `${appUrl}/checkout?planId=${planId}` : `${appUrl}/courses`,
        baseUrl: appUrl,
        metadata: {
          transactionId: reference,
          userId: user.id,
          tenantId,
          itemName,
          ...(planId ? { planId: planId.toString() } : {}),
          ...(productId ? { productId: productId.toString() } : {}),
        },
      })

      // Persist the provider's own reference where it is known at creation
      // time. Solana: the on-chain reference pubkey the verify endpoint locates
      // the transfer/subscribe tx by (for solana_subs it marks the SUBSCRIBE
      // tx, findReference). PayPal: the order id (one-time) or the I-…
      // subscription id (created pre-approval — handle_new_subscription copies
      // it onto the subscription row on activation). Binance: the prepayId
      // (needed for refunds). LS stays webhook-driven; nothing to store here.
      if (
        (providerSlug === 'solana' ||
          providerSlug === 'solana_subs' ||
          providerSlug === 'paypal' ||
          providerSlug === 'binance') &&
        session.providerRef
      ) {
        await supabase
          .from('transactions')
          .update({ provider_subscription_id: session.providerRef })
          .eq('transaction_id', transaction.transaction_id)
      }

      return NextResponse.json({
        kind: session.kind,
        url: session.url ?? null,
        clientSecret: session.clientSecret ?? null,
        reference,
        transactionId: transaction.transaction_id,
      })
    } catch (providerErr) {
      console.error('[payments/checkout] provider checkout failed:', providerErr)
      // Roll the pending transaction back so the unique index does not block a retry.
      await supabase
        .from('transactions')
        .update({ status: 'failed' })
        .eq('transaction_id', transaction.transaction_id)
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
    }
  } catch (error) {
    console.error('[payments/checkout] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
