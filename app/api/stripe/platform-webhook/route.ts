import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type Stripe from 'stripe'
import { sendEmail } from '@/lib/email/send'
import { paymentFailedTemplate } from '@/lib/email/templates/payment-failed'
import { downgradeTenantToFree } from '@/lib/billing/downgrade-tenant'
import { applyPortalPlanChange } from '@/lib/payments/platform-plan-change'

function getPlatformWebhookSecret(): string {
  const secret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('STRIPE_PLATFORM_WEBHOOK_SECRET is not set')
  }
  return secret
}

// webhook_events is keyed by (provider, provider_event_id). The student Connect
// endpoint logs under 'stripe', so platform-billing events get their own
// namespace rather than sharing a key space with it.
const WEBHOOK_PROVIDER = 'stripe_platform'

// platform_subscriptions.status is CHECK-constrained (20260217040000_platform_billing.sql).
// Stripe's vocabulary is a superset — 'paused' is not in the CHECK, and future
// versions may add more. Anything unrecognised collapses to 'past_due': the
// "needs attention, not terminal" bucket the billing-health dashboard and the
// expiry cron already understand. Passing Stripe's value straight through would
// fail the constraint, and the failure used to be discarded behind a 200.
const ALLOWED_SUB_STATUS = new Set([
  'active',
  'past_due',
  'canceled',
  'trialing',
  'incomplete',
  'incomplete_expired',
  'unpaid',
])

function mapSubscriptionStatus(status: unknown): string {
  if (typeof status === 'string' && ALLOWED_SUB_STATUS.has(status)) return status
  console.warn(`[platform-webhook] unmapped Stripe subscription status ${String(status)} -> past_due`)
  return 'past_due'
}

// platform_subscriptions.interval is CHECK-constrained to monthly|yearly and the
// value arrives from checkout-session metadata — pin it to the allowed set.
function mapInterval(interval: unknown): 'monthly' | 'yearly' {
  return interval === 'yearly' ? 'yearly' : 'monthly'
}

const toIso = (unix: unknown): string | undefined =>
  typeof unix === 'number' && Number.isFinite(unix)
    ? new Date(unix * 1000).toISOString()
    : undefined

// Since API 2026-02-25.clover (lib/stripe.ts pins a later version, shapes
// unchanged): current_period_start/end moved
// off the Subscription onto its SubscriptionItems, and Invoice.subscription moved
// under parent.subscription_details. Same accessors as the student webhook —
// lib/payments/stripe-provider.ts:454-460. The `??` fallbacks read the pre-clover
// shape so a replayed old-version payload still resolves; toIso() then degrades a
// missing/garbage value to undefined instead of `new Date(NaN).toISOString()`,
// which threw RangeError and 500'd the whole delivery.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subPeriodStart = (s: any): string | undefined =>
  toIso(s?.items?.data?.[0]?.current_period_start ?? s?.current_period_start)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subPeriodEnd = (s: any): string | undefined =>
  toIso(s?.items?.data?.[0]?.current_period_end ?? s?.current_period_end)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoiceSubId = (inv: any): string | undefined => {
  const sub = inv?.parent?.subscription_details?.subscription ?? inv?.subscription
  return (typeof sub === 'string' ? sub : sub?.id) ?? undefined
}

/**
 * Await a Supabase read/write and throw if it failed. Every DB call in this
 * route goes through here: a swallowed `.error` used to leave the route
 * answering 200 on a write that never landed, so Stripe never retried it.
 */
async function unwrap<T>(
  label: string,
  op: PromiseLike<{ data: T; error: { message?: string } | null }>
): Promise<T> {
  const { data, error } = await op
  if (error) {
    throw new Error(`${label} failed: ${error.message ?? JSON.stringify(error)}`)
  }
  return data
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(body, sig, getPlatformWebhookSecret())
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const adminClient = await createAdminClient()

  // Idempotency: Stripe redelivers, and retries on our 500s. Record the event
  // before handling it and no-op anything already marked processed. Mirrors the
  // provider-agnostic route, app/api/payments/webhook/[provider]/route.ts.
  const { data: existing, error: lookupErr } = await adminClient
    .from('webhook_events')
    .select('id, processed_at')
    .eq('provider', WEBHOOK_PROVIDER)
    .eq('provider_event_id', event.id)
    .maybeSingle()

  if (lookupErr) {
    console.error('[platform-webhook] event lookup failed:', lookupErr)
    return NextResponse.json({ error: 'Event lookup failed' }, { status: 500 })
  }

  if (existing?.processed_at) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // A row without processed_at is a previous attempt that failed mid-flight;
  // reuse it and try again rather than inserting a second one.
  let eventRowId = existing?.id as string | undefined
  if (!eventRowId) {
    const { data: inserted, error: insertErr } = await adminClient
      .from('webhook_events')
      .insert({
        provider: WEBHOOK_PROVIDER,
        provider_event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
      })
      .select('id')
      .single()

    if (insertErr) {
      // 23505 = unique violation: a concurrent delivery of the same event won.
      if ((insertErr as { code?: string }).code === '23505') {
        return NextResponse.json({ received: true, duplicate: true })
      }
      console.error('[platform-webhook] failed to persist event:', insertErr)
      return NextResponse.json({ error: 'Failed to persist event' }, { status: 500 })
    }
    eventRowId = inserted.id
  }

  const now = new Date().toISOString()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const tenantId = session.metadata?.tenant_id
        const planId = session.metadata?.plan_id
        const planSlug = session.metadata?.plan_slug
        const interval = mapInterval(session.metadata?.interval)

        if (!tenantId || !planId) {
          console.error('Missing metadata in checkout session:', session.id)
          break
        }

        // Get subscription details from Stripe
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription: any = await getStripe().subscriptions.retrieve(
          session.subscription as string
        )

        const periodStart = subPeriodStart(subscription)
        const periodEnd = subPeriodEnd(subscription)
        if (!periodEnd) {
          // Degrade rather than 500: the plan still activates and the stored
          // period is left alone. Loud, because the expiry cron reads it.
          console.error(
            `[platform-webhook] no current_period_end on subscription ${subscription?.id} — activating without a period`
          )
        }

        // Upsert platform subscription
        await unwrap(
          'platform_subscriptions upsert',
          adminClient
            .from('platform_subscriptions')
            .upsert({
              tenant_id: tenantId,
              plan_id: planId,
              stripe_subscription_id: subscription.id,
              stripe_customer_id: session.customer as string,
              status: 'active',
              payment_method: 'stripe',
              interval: interval,
              ...(periodStart ? { current_period_start: periodStart } : {}),
              ...(periodEnd ? { current_period_end: periodEnd } : {}),
              updated_at: now,
            }, { onConflict: 'tenant_id' })
        )

        // Update tenant plan
        await unwrap(
          'tenants plan update',
          adminClient
            .from('tenants')
            .update({
              plan: planSlug,
              billing_status: 'active',
              ...(periodEnd ? { billing_period_end: periodEnd } : {}),
              stripe_customer_id: session.customer as string,
              updated_at: now,
            })
            .eq('id', tenantId)
        )

        // Update revenue splits based on new plan's transaction fee
        const plan = await unwrap(
          'platform_plans lookup',
          adminClient
            .from('platform_plans')
            .select('transaction_fee_percent')
            .eq('plan_id', planId)
            .maybeSingle()
        )

        if (plan) {
          await unwrap(
            'revenue_splits upsert',
            adminClient
              .from('revenue_splits')
              .upsert({
                tenant_id: tenantId,
                platform_percentage: plan.transaction_fee_percent,
                school_percentage: 100 - plan.transaction_fee_percent,
                updated_at: now,
              }, { onConflict: 'tenant_id' })
          )
        }

        console.log(`Plan activated: tenant=${tenantId}, plan=${planSlug}`)
        break
      }

      case 'customer.subscription.updated': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription = event.data.object as any
        const tenantId = subscription.metadata?.tenant_id

        if (!tenantId) break

        const periodStart = subPeriodStart(subscription)
        const periodEnd = subPeriodEnd(subscription)

        // Ordering guard. Stripe does not guarantee delivery order, and this
        // handler overwrites status, interval, both period columns and the
        // cancel fields wholesale. A late-arriving older event would rewind
        // current_period_end / tenants.billing_period_end — which drive the
        // expiry cron and the "next payment" date — and could rewind the plan
        // through applyPortalPlanChange. Strictly-older events are dropped
        // whole; an equal period is a legitimate in-period update (a
        // cancel_at_period_end toggle) and still applies.
        const stored = await unwrap(
          'platform_subscriptions period lookup',
          adminClient
            .from('platform_subscriptions')
            .select('current_period_end')
            .eq('tenant_id', tenantId)
            .maybeSingle()
        )

        if (
          periodEnd &&
          stored?.current_period_end &&
          new Date(periodEnd) < new Date(stored.current_period_end)
        ) {
          console.warn(
            `[platform-webhook] dropping out-of-order customer.subscription.updated for tenant ${tenantId}: event period_end ${periodEnd} < stored ${stored.current_period_end}`
          )
          break
        }

        // Derive the billing interval from the subscription item's price so an
        // interval switch (monthly <-> yearly) is reflected locally — the
        // plan-mapped reconciler below treats a same-plan interval change as a
        // no-op and would otherwise leave platform_subscriptions.interval stale.
        const priceInterval = subscription.items?.data?.[0]?.price?.recurring?.interval
        const localInterval =
          priceInterval === 'year' ? 'yearly' : priceInterval === 'month' ? 'monthly' : undefined

        const status = mapSubscriptionStatus(subscription.status)

        // Update subscription period and status
        await unwrap(
          'platform_subscriptions update',
          adminClient
            .from('platform_subscriptions')
            .update({
              status,
              ...(localInterval ? { interval: localInterval } : {}),
              ...(periodStart ? { current_period_start: periodStart } : {}),
              ...(periodEnd ? { current_period_end: periodEnd } : {}),
              cancel_at_period_end: subscription.cancel_at_period_end,
              canceled_at: toIso(subscription.canceled_at) ?? null,
              updated_at: now,
            })
            .eq('tenant_id', tenantId)
        )

        await unwrap(
          'tenants billing update',
          adminClient
            .from('tenants')
            .update({
              billing_status: status,
              ...(periodEnd ? { billing_period_end: periodEnd } : {}),
              updated_at: now,
            })
            .eq('id', tenantId)
        )

        // If plan changed via Stripe portal, apply it with downgrade-limit
        // enforcement (over-limit downgrades are reverted on Stripe and admins
        // notified — see lib/payments/platform-plan-change.ts).
        await applyPortalPlanChange(subscription, {
          admin: adminClient,
          stripe: getStripe(),
        })

        break
      }

      case 'customer.subscription.deleted': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription = event.data.object as any
        const tenantId = subscription.metadata?.tenant_id

        if (!tenantId) break

        // Downgrade to free — shared helper reads the free-plan fee from
        // platform_plans instead of hardcoding the revenue split.
        const platformFee = await downgradeTenantToFree(adminClient, tenantId)

        console.log(`Subscription canceled, downgraded to free: tenant=${tenantId} fee=${platformFee}%`)
        break
      }

      case 'invoice.payment_failed': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = event.data.object as any
        const subscriptionId = invoiceSubId(invoice)

        if (!subscriptionId) break

        const sub = await unwrap(
          'platform_subscriptions lookup by stripe id',
          adminClient
            .from('platform_subscriptions')
            .select('tenant_id')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle()
        )

        if (sub) {
          await unwrap(
            'platform_subscriptions past_due',
            adminClient
              .from('platform_subscriptions')
              .update({ status: 'past_due', updated_at: now })
              .eq('tenant_id', sub.tenant_id)
          )

          await unwrap(
            'tenants past_due',
            adminClient
              .from('tenants')
              .update({ billing_status: 'past_due', updated_at: now })
              .eq('id', sub.tenant_id)
          )

          // Email the school admin about the failed payment. Best-effort: a
          // mail failure must not undo the past_due writes above by 500-ing.
          try {
            const { data: tenantRow } = await adminClient
              .from('tenants')
              .select('name')
              .eq('id', sub.tenant_id)
              .maybeSingle()

            const { data: adminUsers } = await adminClient
              .from('tenant_users')
              .select('user_id')
              .eq('tenant_id', sub.tenant_id)
              .eq('role', 'admin')
              .eq('status', 'active')

            const { data: planRow } = await adminClient
              .from('platform_subscriptions')
              .select('platform_plans(name)')
              .eq('tenant_id', sub.tenant_id)
              .maybeSingle()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const planName = (planRow?.platform_plans as any)?.name || 'your plan'
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'

            for (const admin of adminUsers || []) {
              const { data: authUser } = await adminClient.auth.admin.getUserById(admin.user_id)
              if (authUser?.user?.email) {
                const template = paymentFailedTemplate({
                  schoolName: tenantRow?.name || 'your school',
                  planName,
                  billingUrl: `${appUrl}/dashboard/admin/billing`,
                })
                await sendEmail({ to: authUser.user.email, ...template })
              }
            }
          } catch (emailErr) {
            console.error('Failed to send payment failed email:', emailErr)
          }
        }

        break
      }

      case 'invoice.paid': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = event.data.object as any
        const subscriptionId = invoiceSubId(invoice)

        if (!subscriptionId) break

        const sub = await unwrap(
          'platform_subscriptions lookup by stripe id',
          adminClient
            .from('platform_subscriptions')
            .select('tenant_id, status')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle()
        )

        // Idempotency: only update if not already active
        if (sub && sub.status !== 'active') {
          await unwrap(
            'platform_subscriptions active',
            adminClient
              .from('platform_subscriptions')
              .update({ status: 'active', updated_at: now })
              .eq('tenant_id', sub.tenant_id)
          )

          await unwrap(
            'tenants active',
            adminClient
              .from('tenants')
              .update({ billing_status: 'active', updated_at: now })
              .eq('id', sub.tenant_id)
          )
        }

        break
      }
    }
  } catch (error) {
    console.error('Platform webhook error:', error)
    // processed_at stays unset so a Stripe retry re-runs the handler.
    const { error: recordErr } = await adminClient
      .from('webhook_events')
      .update({ error: error instanceof Error ? error.message : String(error) })
      .eq('id', eventRowId)
    if (recordErr) {
      console.error('[platform-webhook] failed to record handler error:', recordErr)
    }
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  const { error: markErr } = await adminClient
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', eventRowId)
  if (markErr) {
    // The event will be redelivered and re-run. Handlers converge (status
    // writes are absolute, periods come from the event), so log, don't fail.
    console.error(`[platform-webhook] failed to mark event ${event.id} processed:`, markErr)
  }

  return NextResponse.json({ received: true })
}
