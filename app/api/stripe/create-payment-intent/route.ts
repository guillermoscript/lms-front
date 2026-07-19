import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { toCents } from '@/lib/currency'
import { getPaymentProvider } from '@/lib/payments'
import {
  findConflictingSubscription,
  PARALLEL_SUBSCRIPTION_CODE,
  PARALLEL_SUBSCRIPTION_MESSAGE,
} from '@/lib/payments/subscription-guard'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { planId, productId } = body

    if (!planId && !productId) {
      return NextResponse.json({ error: 'Missing plan or product ID' }, { status: 400 })
    }

    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parallel-subscription guard (#459): block before any Stripe side effects
    // (customer creation, subscription, PaymentIntent). Same-plan renewal passes.
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

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', user.id)
      .single()

    let stripeCustomerId = profile?.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        name: profile?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      })
      stripeCustomerId = customer.id

      // Save Stripe customer ID to profile
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id)
    }

    // Get tenant's Stripe Connect account
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('stripe_account_id')
      .eq('id', tenantId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }

    if (!tenant.stripe_account_id) {
      return NextResponse.json({
        error: 'School has not connected their payment account. Please contact school admin to set up payments.'
      }, { status: 400 })
    }

    // Get price based on plan or product
    let amount: number
    let itemName: string
    let currency = 'usd'
    let planProviderPriceId: string | null = null
    let planPaymentProvider = 'stripe'

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
      currency = plan.currency || 'usd'
      amount = toCents(Number(plan.price), currency)
      itemName = plan.plan_name
      planProviderPriceId = plan.provider_price_id
      planPaymentProvider = plan.payment_provider || 'stripe'
    } else {
      const { data: product, error } = await supabase
        .from('products')
        .select('price, name, currency')
        .eq('product_id', productId)
        .eq('tenant_id', tenantId)
        .single()

      if (error || !product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }
      currency = product.currency || 'usd'
      amount = toCents(Number(product.price), currency)
      itemName = product.name
    }

    // Get revenue split configuration for this tenant
    const { data: split } = await supabase
      .from('revenue_splits')
      .select('platform_percentage')
      .eq('tenant_id', tenantId)
      .single()

    // Calculate platform fee (default to 20% if not configured)
    const platformPercentage = split?.platform_percentage || 20
    const platformFee = Math.round((amount * platformPercentage) / 100)

    // Create transaction record (pending)
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        plan_id: planId || null,
        product_id: productId || null,
        amount: amount / (currency === 'clp' || currency === 'jpy' ? 1 : 100), // Store in display units
        currency,
        status: 'pending',
        payment_provider: 'stripe',
        tenant_id: tenantId,
      })
      .select('transaction_id')
      .single()

    if (txError || !transaction) {
      console.error('Transaction creation error:', txError)
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
    }

    // Native subscription path (#280 Phase 2): a Stripe plan with a recurring
    // price becomes a real Stripe Subscription, so provider_subscription_id is
    // stored at creation and renewals/cancels are webhook-driven. Legacy/manual
    // plans (no recurring provider_price_id) fall through to the one-time
    // PaymentIntent path below, unchanged.
    if (planId && planPaymentProvider === 'stripe' && planProviderPriceId) {
      try {
        const provider = getPaymentProvider('stripe')
        const session = await provider.createCheckoutSession!({
          mode: 'subscription',
          providerPriceId: planProviderPriceId,
          amount,
          currency,
          reference: transaction.transaction_id.toString(),
          providerCustomerId: stripeCustomerId,
          destinationAccount: tenant.stripe_account_id,
          applicationFeePercent: platformPercentage,
          metadata: {
            transactionId: transaction.transaction_id.toString(),
            userId: user.id,
            tenantId,
            planId: planId.toString(),
          },
        })

        // Persist the Stripe subscription id; the handle_new_subscription trigger
        // copies it onto the subscriptions row when the first invoice succeeds.
        await supabase
          .from('transactions')
          .update({ provider_subscription_id: session.providerRef })
          .eq('transaction_id', transaction.transaction_id)

        if (!session.clientSecret) {
          return NextResponse.json({ error: 'Failed to initialize subscription payment' }, { status: 500 })
        }

        return NextResponse.json({
          clientSecret: session.clientSecret,
          transactionId: transaction.transaction_id,
        })
      } catch (subErr) {
        console.error('Subscription creation error:', subErr)
        // Roll the pending transaction back so the unique index doesn't block a retry.
        await supabase
          .from('transactions')
          .update({ status: 'failed' })
          .eq('transaction_id', transaction.transaction_id)
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
      }
    }

    // Create Stripe PaymentIntent with Connect (revenue split)
    // When fee is 0%, still use transfer_data for routing but set fee to 0
    const stripe = getStripe()

    const paymentIntentParams: Record<string, unknown> = {
      amount,
      currency,
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      transfer_data: {
        destination: tenant.stripe_account_id, // Money goes to school
      },
      metadata: {
        transactionId: transaction.transaction_id.toString(),
        userId: user.id,
        tenantId: tenantId,
        planId: planId?.toString() || '',
        productId: productId?.toString() || '',
      },
    }

    // Only add application fee if > 0
    if (platformFee > 0) {
      paymentIntentParams.application_fee_amount = platformFee
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams as any)

    // Save payment intent ID for refund tracking
    await supabase
      .from('transactions')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('transaction_id', transaction.transaction_id)

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      transactionId: transaction.transaction_id,
    })
  } catch (error) {
    console.error('Payment intent error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
