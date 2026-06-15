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

// Providers whose checkout this route owns. Stripe + manual have their own paths.
const HANDLED: PaymentProvider[] = ['lemonsqueezy', 'solana', 'solana_subs']

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { planId, productId } = await req.json()
    if (!planId && !productId) {
      return NextResponse.json({ error: 'Missing plan or product ID' }, { status: 400 })
    }

    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      })
      .select('transaction_id')
      .single()

    if (txError || !transaction) {
      console.error('[payments/checkout] transaction insert failed:', txError)
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
    }

    const reference = transaction.transaction_id.toString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

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
        successUrl: appUrl ? `${appUrl}/dashboard/student?checkout=success` : undefined,
        cancelUrl: appUrl ? `${appUrl}/dashboard/student?checkout=cancelled` : undefined,
        metadata: {
          transactionId: reference,
          userId: user.id,
          tenantId,
          itemName,
          ...(planId ? { planId: planId.toString() } : {}),
          ...(productId ? { productId: productId.toString() } : {}),
        },
      })

      // Solana: persist the on-chain reference pubkey so the verify endpoint can
      // locate the transfer/subscribe tx later. (LS creates the subscription
      // server-side; its id arrives on the webhook, so nothing to store here.)
      // For solana_subs the reference marks the SUBSCRIBE tx (findReference).
      if ((providerSlug === 'solana' || providerSlug === 'solana_subs') && session.providerRef) {
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
