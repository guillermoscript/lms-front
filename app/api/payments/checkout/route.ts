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
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getPaymentProvider } from '@/lib/payments'
import type { CreateCheckoutParams, PaymentProvider } from '@/lib/payments/types'
import { getSolUsdPrice, usdToLamports } from '@/lib/payments/sol-price'
import { getSolanaSettlementOptions } from '@/app/actions/admin/settings'
import { paymentAuthLimiter } from '@/lib/rate-limit'
import { DEFAULT_SCHOOL_PERCENTAGE } from '@/lib/payments/payouts-owed'
import {
  findConflictingSubscription,
  PARALLEL_SUBSCRIPTION_CODE,
  PARALLEL_SUBSCRIPTION_MESSAGE,
} from '@/lib/payments/subscription-guard'
import {
  isReadyToAcceptPayments,
  READINESS_CODE,
  READINESS_MESSAGE,
} from '@/lib/payments/tenant-payment-readiness'

// Providers whose checkout this route owns. Stripe + manual have their own paths.
const HANDLED: PaymentProvider[] = ['lemonsqueezy', 'solana', 'solana_subs', 'paypal', 'binance', 'binance_personal']

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

    // Connected-account readiness gate (#606). A no-op for every rail this
    // route currently handles — none of them `requiresConnectedAccount`, so the
    // helper short-circuits without a query. It lives here anyway so the rule
    // is a property of "starting a payment" rather than of whichever route
    // happened to remember it: the next marketplace rail we add inherits the
    // gate instead of repeating the #606 bug.
    const readiness = await isReadyToAcceptPayments(tenantId, providerSlug as PaymentProvider)
    if (!readiness.ready) {
      return NextResponse.json(
        {
          error: READINESS_MESSAGE[readiness.reason],
          code: READINESS_CODE[readiness.reason],
        },
        { status: 400 },
      )
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

    // binance_personal: the "checkout" is a manual transfer to the school's
    // Binance Pay ID. Resolve it up front (admin client — the wallets table is
    // RLS'd to admins) so an unconfigured school fails BEFORE a pending
    // transaction exists.
    let binancePersonalPayId: string | null = null
    if (providerSlug === 'binance_personal') {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const adminClient = createAdminClient()
      const { data: wallet } = await adminClient
        .from('tenant_payment_wallets')
        .select('wallet_address')
        .eq('tenant_id', tenantId)
        .eq('provider', 'binance_personal')
        .maybeSingle()
      if (!wallet?.wallet_address) {
        return NextResponse.json(
          { error: 'This school has not configured Binance Pay (personal)' },
          { status: 400 },
        )
      }
      binancePersonalPayId = wallet.wallet_address
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

    // Snapshot the tenant's CURRENT revenue split onto this transaction (#496)
    // so a later plan change doesn't retroactively reprice it in the payouts
    // computation. The admin client is belt-and-braces, not a requirement: this
    // comment used to say revenue_splits is "super-admin-only under RLS", which
    // is wrong — the SELECT policy is `tenant_id = get_tenant_id() OR
    // is_super_admin()`, so the user-scoped client could read it too (#512).
    //
    // Since #512 the DATABASE owns this column: the BEFORE INSERT trigger in
    // 20260725110000_transaction_split_snapshot_backstop.sql recomputes it from
    // the same table and ignores whatever we send, because the column is
    // writable by any authenticated client (transactions RLS restricts rows, not
    // columns) and a student-supplied value must not survive. This write is kept
    // deliberately: it computes the identical number, and it keeps the rollback
    // migration a safe lever — drop the trigger and this path still snapshots.
    const adminClient = createAdminClient()
    const { data: revenueSplit } = await adminClient
      .from('revenue_splits')
      .select('school_percentage')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const schoolPercentageSnapshot = revenueSplit?.school_percentage ?? DEFAULT_SCHOOL_PERCENTAGE

    // 1. Pending transaction — our correlation id (transaction_id) round-trips
    //    back on the webhook (LS) or the verify endpoint (Solana).
    //
    // The ADMIN client, since #538. The settlement_* figures below are what the
    // on-chain payment is later verified against (lib/payments/solana-reconcile.ts
    // → verifySplitTransfer({ totalBase })), and this used to be the reason
    // `authenticated` had to keep an INSERT grant on `transactions` — which meant a
    // student could POST their own pending row claiming it owed 1 lamport for a $49
    // product, pay that, and be enrolled. Writing here on the service-role client
    // let 20260725180000 revoke the grant outright, so `amount`, `currency`,
    // `payment_provider` and all four settlement columns are now server-owned.
    //
    // Per CLAUDE.md that shifts the tenant check to us, and it is already in place:
    // `user.id` comes from the verified session, `tenantId` from the x-tenant-id
    // header proxy.ts sets, and every field below is derived from the tenant-scoped
    // `plans` / `products` read above on the USER-scoped client — so a caller still
    // cannot reference another tenant's catalogue or price. The live SOL/USD quote
    // (getSolUsdPrice) never crosses the client boundary in either direction, which
    // is why this is an admin-client write and not a SECURITY DEFINER RPC: an RPC
    // would have to accept that rate as a caller-supplied parameter.
    const { data: transaction, error: txError } = await adminClient
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
        school_percentage_snapshot: schoolPercentageSnapshot,
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
        ...(binancePersonalPayId ? { destinationAccount: binancePersonalPayId } : {}),
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
        instructions: session.instructions ?? null,
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
