/**
 * Platform fee pay-now (#929, design 2.4): the school pays (part of) the
 * commission it owes the platform on sales it collected directly.
 *
 * NOT an overload of `/api/billing/checkout`, which is plan / interval /
 * subscription-switch shaped. Same guards: authenticated, active admin of the
 * tenant, rail capability-gated (`supportsPlatformFeePayNow`).
 *
 * The amount is derived server-side from the live ledger: `min(netOwed,
 * requested)`, default the full balance. The request body only ever caps it.
 * Never blocked by the fee sales gate — paying must always work (4.2).
 *
 * Rails:
 *  - `stripe`: a pending `platform_fee_payments` row, then a hosted Checkout
 *    Session (mode `payment`) on the platform account carrying
 *    `{ kind: 'platform_fee', tenant_id, payment_id }`. Settled by the platform
 *    webhook (`dispatchPlatformBillingEvent` → `settle_platform_fee_payment`).
 *    USD only.
 *  - `manual`: a pending payment row plus a `platform_payment_requests` row
 *    (`request_type = 'fee'`) a super admin confirms
 *    (`confirm_platform_fee_request`). Any ledger currency. One open fee
 *    request at a time; an open request does NOT pause a block (3.3).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { resolveRequestLocale } from '@/lib/i18n/request-locale'
import { getPlatformBillingProvider } from '@/lib/billing/platform-billing'
import { hasOpenPaymentRequest, requestExpiresAt } from '@/lib/billing/payment-request-ttl'
import {
  getTenantFeeBalances,
  quoteFeePayNow,
  toMinorUnits,
  type PayNowError,
} from '@/lib/billing/platform-fee-paynow'
import { PLATFORM_FEE_METADATA_KIND } from '@/lib/billing/platform-fee-settlement'

export const runtime = 'nodejs'

const QUOTE_ERRORS: Record<PayNowError, { status: number; message: string }> = {
  unsupported_rail: { status: 400, message: 'This payment method cannot be used to pay platform fees.' },
  currency_not_supported_on_rail: {
    status: 400,
    message: 'Only USD balances can be paid automatically. Pay other currencies by bank transfer.',
  },
  nothing_owed: { status: 400, message: 'There is nothing to pay in this currency.' },
  invalid_amount: { status: 400, message: 'Enter a positive amount.' },
  amount_below_minimum: {
    status: 400,
    message: 'This amount is below the card minimum. Pay it by bank transfer instead.',
  },
}

const errorBody = (code: string, message: string) => ({ error: message, code })

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(errorBody('invalid_body', 'Invalid request body'), { status: 400 })
    }
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const currency = typeof body.currency === 'string' ? body.currency : undefined
    const trimmed = (v: unknown, max: number) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(errorBody('unauthorized', 'Unauthorized'), { status: 401 })
    }

    const { data: membership } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(errorBody('forbidden', 'Only school admins can pay platform fees'), { status: 403 })
    }

    const admin = createAdminClient()
    const balances = await getTenantFeeBalances(admin, tenantId)
    const quote = quoteFeePayNow({ provider, currency, requested: body.amount, balances })
    if (!quote.ok) {
      const e = QUOTE_ERRORS[quote.error]
      return NextResponse.json(errorBody(quote.error, e.message), { status: e.status })
    }
    const { amount, currency: ledgerCurrency, netOwed, partial } = quote.value

    // ── manual: a request a super admin confirms ──
    if (quote.value.provider === 'manual') {
      if (await hasOpenPaymentRequest(admin, tenantId, { kind: 'fee' })) {
        return NextResponse.json(
          errorBody('fee_request_open', 'You already have a fee payment waiting for confirmation.'),
          { status: 409 },
        )
      }

      const { data: payment, error: paymentError } = await admin
        .from('platform_fee_payments')
        .insert({
          tenant_id: tenantId,
          currency: ledgerCurrency,
          amount,
          provider: 'manual',
          status: 'pending',
          requested_by: user.id,
        })
        .select('payment_id')
        .single()
      if (paymentError || !payment) {
        console.error('[billing/fees/checkout] payment insert failed:', paymentError?.code, paymentError?.message)
        return NextResponse.json(errorBody('internal', 'Could not start the payment'), { status: 500 })
      }

      const expiresAt = requestExpiresAt()
      const { data: request, error: requestError } = await admin
        .from('platform_payment_requests')
        .insert({
          tenant_id: tenantId,
          plan_id: null,
          fee_payment_id: payment.payment_id,
          request_type: 'fee',
          requested_by: user.id,
          amount,
          currency: ledgerCurrency.toLowerCase(),
          status: 'pending',
          payment_provider: 'manual',
          bank_reference: trimmed(body.bankReference, 255),
          notes: trimmed(body.notes, 2000),
          expires_at: expiresAt,
        })
        .select('request_id')
        .single()
      if (requestError || !request) {
        console.error('[billing/fees/checkout] request insert failed:', requestError?.code, requestError?.message)
        await admin
          .from('platform_fee_payments')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('payment_id', payment.payment_id)
          .eq('status', 'pending')
        return NextResponse.json(errorBody('internal', 'Could not start the payment'), { status: 500 })
      }

      return NextResponse.json(
        {
          kind: 'instructions',
          provider: 'manual',
          requestId: request.request_id,
          paymentId: payment.payment_id,
          amount,
          currency: ledgerCurrency,
          netOwed,
          partial,
          expiresAt,
        },
        { status: 201 },
      )
    }

    // ── automated rail (Stripe): hosted one-off checkout ──
    let paymentProvider
    try {
      paymentProvider = getPlatformBillingProvider(quote.value.provider)
    } catch (err) {
      console.error('[billing/fees/checkout] provider not configured:', err instanceof Error ? err.message : err)
      return NextResponse.json(errorBody('provider_unavailable', 'This payment method is not available.'), {
        status: 503,
      })
    }
    if (!paymentProvider.createCheckoutSession) {
      return NextResponse.json(errorBody('provider_unavailable', 'This payment method is not available.'), {
        status: 501,
      })
    }

    const { data: payment, error: paymentError } = await admin
      .from('platform_fee_payments')
      .insert({
        tenant_id: tenantId,
        currency: ledgerCurrency,
        amount,
        provider: quote.value.provider,
        status: 'pending',
        requested_by: user.id,
      })
      .select('payment_id')
      .single()
    if (paymentError || !payment) {
      console.error('[billing/fees/checkout] payment insert failed:', paymentError?.code, paymentError?.message)
      return NextResponse.json(errorBody('internal', 'Could not start the payment'), { status: 500 })
    }

    // Reuse the tenant's customer on this rail if one exists; a one-off
    // payment does not need one created.
    const { data: billingCustomer } = await admin
      .from('tenant_billing_customers')
      .select('provider_customer_id')
      .eq('tenant_id', tenantId)
      .eq('payment_provider', quote.value.provider)
      .maybeSingle()

    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || ''
    const locale = resolveRequestLocale(req, body.locale)
    const returnPath = `${origin}/${locale}/dashboard/admin/earnings`

    let session
    try {
      session = await paymentProvider.createCheckoutSession({
        mode: 'one_time',
        hosted: true,
        providerPriceId: '',
        amount: toMinorUnits(amount),
        currency: ledgerCurrency.toLowerCase(),
        reference: `platform_fee:${tenantId}:${payment.payment_id}`,
        providerCustomerId: billingCustomer?.provider_customer_id ?? undefined,
        successUrl: `${returnPath}?fee_payment=${payment.payment_id}`,
        cancelUrl: returnPath,
        baseUrl: origin || undefined,
        lineItemName: 'Platform fee',
        metadata: {
          kind: PLATFORM_FEE_METADATA_KIND,
          tenant_id: tenantId,
          payment_id: payment.payment_id,
        },
      })
    } catch (err) {
      console.error('[billing/fees/checkout] checkout failed:', err instanceof Error ? err.message : err)
      await admin
        .from('platform_fee_payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('payment_id', payment.payment_id)
        .eq('status', 'pending')
      return NextResponse.json(errorBody('provider_error', 'Could not start checkout'), { status: 502 })
    }

    if (!session.url) {
      await admin
        .from('platform_fee_payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('payment_id', payment.payment_id)
        .eq('status', 'pending')
      return NextResponse.json(errorBody('provider_error', 'Could not start checkout'), { status: 502 })
    }

    await admin
      .from('platform_fee_payments')
      .update({ provider_reference: session.providerRef ?? session.reference, updated_at: new Date().toISOString() })
      .eq('payment_id', payment.payment_id)

    return NextResponse.json({
      kind: session.kind,
      url: session.url,
      provider: quote.value.provider,
      paymentId: payment.payment_id,
      amount,
      currency: ledgerCurrency,
      netOwed,
      partial,
    })
  } catch (error) {
    console.error('[billing/fees/checkout] error:', error instanceof Error ? error.message : error)
    return NextResponse.json(errorBody('internal', 'Internal server error'), { status: 500 })
  }
}
