/**
 * Applies a `NormalizedBillingEvent` to school → platform billing state
 * (`platform_subscriptions`, `tenants`, `revenue_splits`) — the platform twin
 * of `dispatchBillingEvent` (#603).
 *
 * Two dispatchers rather than one because the two loops write disjoint tables
 * and disagree about what a row means: student `subscriptions` are per-user and
 * keyed by (provider_subscription_id, payment_provider), platform rows are one
 * per tenant with a plan, a revenue split and a tenant mirror to keep in step.
 * Folding them together would have meant a tenant/user branch inside every
 * case. What IS shared is everything above this layer: the event vocabulary,
 * the verify → persist → normalize → dispatch pipeline and the `webhook_events`
 * ledger.
 *
 * Everything the Stripe-shaped route at `app/api/stripe/platform-webhook`
 * used to do lives here, minus its knowledge of Stripe event names: the
 * subscription upsert shape, the customer-id record, the plan's revenue split,
 * the out-of-order period guard, the status whitelist, the downgrade-to-free on
 * cancel, the failed-payment email and the portal plan-change reconciliation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { paymentFailedTemplate } from '@/lib/email/templates/payment-failed'
import { downgradeTenantToFree } from '@/lib/billing/downgrade-tenant'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { applyPortalPlanChange } from '@/lib/payments/platform-plan-change'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import type {
  NormalizedBillingEvent,
  PaymentProvider,
  SubscriptionLifecycleStatus,
} from '@/lib/payments/types'

/**
 * `platform_subscriptions.status` is CHECK-constrained
 * (20260217040000_platform_billing.sql). A provider's own vocabulary can be a
 * superset, and adapters already map into `SubscriptionLifecycleStatus`, but an
 * unmapped value must still not reach the database: it would fail the
 * constraint, and that failure used to be discarded behind a 200 (#544).
 * Anything unrecognised collapses to `past_due` — the "needs attention, not
 * terminal" bucket the billing-health dashboard and the expiry cron understand.
 */
const ALLOWED_SUB_STATUS = new Set<string>([
  'active',
  'past_due',
  'canceled',
  'trialing',
  'incomplete',
  'incomplete_expired',
  'unpaid',
])

function storedStatus(status: SubscriptionLifecycleStatus | undefined, fallback: string): string {
  if (!status) return fallback
  if (ALLOWED_SUB_STATUS.has(status)) return status
  console.warn(`[platform-webhook] unmapped subscription status ${String(status)} -> past_due`)
  return 'past_due'
}

/** The status an event type implies when the provider reported none. */
const STATUS_BY_TYPE: Record<string, string> = {
  'subscription.activated': 'active',
  'subscription.renewed': 'active',
  'subscription.past_due': 'past_due',
  'subscription.canceled': 'canceled',
  'subscription.expired': 'canceled',
}

/**
 * Await a read/write and throw if it failed. Every DB call goes through here:
 * a swallowed `.error` used to leave the route answering 200 on a write that
 * never landed, so the provider never retried it (#544).
 */
async function unwrap<T>(
  label: string,
  op: PromiseLike<{ data: T; error: { message?: string } | null }>,
): Promise<T> {
  const { data, error } = await op
  if (error) {
    throw new Error(`${label} failed: ${error.message ?? JSON.stringify(error)}`)
  }
  return data
}

export interface PlatformDispatchContext {
  /** Provider slug — the `payment_provider` written on the row. */
  provider: string
  /** Service-role Supabase client (bypasses RLS). */
  admin: SupabaseClient
  /**
   * Move the provider's subscription back onto a price, no proration. Supplied
   * by the route from the provider's own `updateSubscription` when
   * `supportsPlanChange` allows it; without it an over-limit downgrade is
   * applied to the DB rather than reverted.
   */
  revertToPrice?: (providerSubscriptionId: string, providerPriceId: string) => Promise<void>
  /** Injectable for tests; defaults to the Mailgun sender. */
  sendEmailFn?: typeof sendEmail
}

/** Locate the tenant an event is about, by metadata first, then by subscription id. */
async function resolveTenantId(
  event: NormalizedBillingEvent,
  { provider, admin }: PlatformDispatchContext,
): Promise<string | null> {
  const fromMetadata = event.metadata?.tenant_id ?? event.metadata?.tenantId
  if (fromMetadata) return fromMetadata

  if (!event.providerSubscriptionId) return null
  const row = await unwrap(
    'platform_subscriptions lookup by provider subscription id',
    admin
      .from('platform_subscriptions')
      .select('tenant_id')
      .eq('payment_provider', provider)
      .eq('provider_subscription_id', event.providerSubscriptionId)
      .maybeSingle(),
  )
  return (row as { tenant_id: string } | null)?.tenant_id ?? null
}

interface StoredSubscription {
  plan_id: string | null
  status: string | null
  current_period_end: string | null
}

/**
 * `platform_subscriptions.interval` is CHECK-constrained to monthly|yearly and
 * the value can arrive from checkout metadata, which is a free-text bag — pin
 * anything unrecognised to monthly rather than failing the constraint.
 */
function mapInterval(value: unknown): 'monthly' | 'yearly' | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return value === 'yearly' ? 'yearly' : 'monthly'
}

/**
 * The period a payment on a self-managed rail buys (#610).
 *
 * Binance Pay and Solana have no subscription object and no renewal webhook: a
 * plan purchase is a one-time payment, and the period it opens is ours to
 * derive. Renewing before the current one lapses extends from its end rather
 * than from now, so paying early never costs the school the remaining days —
 * the same arithmetic `confirmManualPayment` applies to a bank wire.
 */
export function selfManagedPeriod(
  storedEnd: string | null | undefined,
  interval: 'monthly' | 'yearly' | undefined,
  now: Date,
): { start: Date; end: Date } {
  const stored = storedEnd ? new Date(storedEnd) : null
  const start = stored && stored > now ? stored : now
  const end = new Date(start)
  // UTC arithmetic, not local: `setMonth` rolls over in the server's own zone,
  // so a period that crosses a DST boundary would land an hour early or late
  // depending on where the process happens to run. Nothing here is local to
  // anyone — the school, the chain and the cron all read this as an instant.
  if (interval === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1)
  else end.setUTCMonth(end.getUTCMonth() + 1)
  return { start, end }
}

/**
 * Would this event rewind the stored period?
 *
 * Providers do not guarantee delivery order, and the subscription writes below
 * overwrite status, interval, both period columns and the cancel fields
 * wholesale. A late-arriving older event would rewind `current_period_end` /
 * `tenants.billing_period_end` — which drive the expiry cron and the "next
 * payment" date — and could rewind the plan through `applyPortalPlanChange`.
 * Strictly-older events are dropped whole; an equal period is a legitimate
 * in-period update (a cancel-at-period-end toggle) and still applies.
 */
function isStalePeriod(
  stored: StoredSubscription | null,
  tenantId: string,
  periodEnd: Date | undefined,
): boolean {
  if (!periodEnd || !stored?.current_period_end) return false
  if (periodEnd.getTime() >= new Date(stored.current_period_end).getTime()) return false
  console.warn(
    `[platform-webhook] dropping out-of-order event for tenant ${tenantId}: event period_end ${periodEnd.toISOString()} < stored ${stored.current_period_end}`,
  )
  return true
}

/** Rewrite the tenant's revenue split from its plan's transaction fee. */
async function applyRevenueSplit(admin: SupabaseClient, tenantId: string, planId: string, now: string) {
  const plan = await unwrap(
    'platform_plans lookup',
    admin
      .from('platform_plans')
      .select('transaction_fee_percent')
      .eq('plan_id', planId)
      .maybeSingle(),
  )
  const fee = (plan as { transaction_fee_percent: number } | null)?.transaction_fee_percent
  if (fee == null) return

  await unwrap(
    'revenue_splits upsert',
    admin
      .from('revenue_splits')
      .upsert(
        {
          tenant_id: tenantId,
          platform_percentage: fee,
          school_percentage: 100 - fee,
          updated_at: now,
        },
        { onConflict: 'tenant_id' },
      ),
  )
}

/**
 * Last-resort plan resolution for an event that names a price but no plan, on a
 * tenant we hold no subscription row for. Only reachable when a provider's
 * subscription event overtakes its own checkout event.
 */
async function planIdForPrice(
  admin: SupabaseClient,
  provider: string,
  providerPriceId: string | undefined,
): Promise<string | undefined> {
  if (!providerPriceId) return undefined
  const { data } = await admin
    .from('platform_plan_prices')
    .select('plan_id')
    .eq('payment_provider', provider)
    .eq('provider_price_id', providerPriceId)
    .limit(1)
    .maybeSingle()
  return (data as { plan_id: string } | null)?.plan_id ?? undefined
}

/** Email every active admin of the school that its platform payment failed. */
async function notifyPaymentFailed(
  admin: SupabaseClient,
  tenantId: string,
  sendEmailFn: typeof sendEmail,
) {
  const { data: tenantRow } = await admin.from('tenants').select('name').eq('id', tenantId).maybeSingle()
  const { data: adminUsers } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('status', 'active')
  const { data: planRow } = await admin
    .from('platform_subscriptions')
    .select('platform_plans(name)')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planName = (planRow?.platform_plans as any)?.name || 'your plan'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'

  for (const row of adminUsers || []) {
    const { data: authUser } = await admin.auth.admin.getUserById(row.user_id)
    if (authUser?.user?.email) {
      await sendEmailFn({
        to: authUser.user.email,
        ...paymentFailedTemplate({
          schoolName: tenantRow?.name || 'your school',
          planName,
          billingUrl: `${appUrl}/dashboard/admin/billing`,
        }),
      })
    }
  }
}

export async function dispatchPlatformBillingEvent(
  event: NormalizedBillingEvent,
  ctx: PlatformDispatchContext,
): Promise<void> {
  const { provider, admin, revertToPrice, sendEmailFn = sendEmail } = ctx
  const now = new Date().toISOString()

  const tenantId = await resolveTenantId(event, ctx)
  if (!tenantId) {
    console.warn(`[platform-webhook] ${event.type} on ${provider} resolved no tenant — ignoring`)
    return
  }

  // A terminal cancel is the one case that does not write the subscription row
  // directly: downgradeTenantToFree owns the whole transition (subscription
  // canceled + tenant reset + free-plan split + access-cutoff reconcile), and
  // duplicating any of it here is how the two paths drift.
  if (event.type === 'subscription.canceled' || event.type === 'subscription.expired') {
    const platformFee = await downgradeTenantToFree(admin, tenantId)
    console.log(
      `[platform-webhook] subscription ${event.type} on ${provider}, tenant ${tenantId} downgraded to free (fee=${platformFee}%)`,
    )

    // Loop E, terminal school churn on a PUSH-RENEWAL rail. The
    // `expire-platform-subscriptions` cron emits the same event for rails whose
    // period WE own (`PLATFORM_SELF_MANAGED_PROVIDERS`); it never sees Stripe,
    // Lemon Squeezy or PayPal, whose expiry is decided here. Between the two,
    // every rail is covered exactly once.
    //
    // `plan` is null on purpose rather than fetched: this branch deliberately
    // returns before the `platform_subscriptions` lookup below, and a churn
    // event is not worth adding a query to a webhook for. `tenant_id` joins it
    // to whatever plan the tenant last paid for.
    void track(
      ANALYTICS_EVENTS.SUBSCRIPTION_EXPIRED,
      {
        scope: 'platform',
        plan: null,
        provider,
        // No grace window on a push-renewal rail — the provider ran its own
        // dunning before telling us. Stated rather than omitted so the property
        // is comparable with the cron's.
        was_grace: false,
        churn_type: event.type === 'subscription.canceled' ? 'voluntary' : 'involuntary',
        event_type: event.type,
      },
      { tenantId },
    )
    return
  }

  const stored = (await unwrap(
    'platform_subscriptions lookup',
    admin
      .from('platform_subscriptions')
      .select('plan_id, status, current_period_end')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  )) as StoredSubscription | null

  if (isStalePeriod(stored, tenantId, event.periodEnd)) return

  const status = storedStatus(event.subscriptionStatus, STATUS_BY_TYPE[event.type] ?? 'active')
  const periodStart = event.periodStart?.toISOString()
  const periodEnd = event.periodEnd?.toISOString()

  if (event.type === 'subscription.past_due') {
    await unwrap(
      'platform_subscriptions past_due',
      admin.from('platform_subscriptions').update({ status, updated_at: now }).eq('tenant_id', tenantId),
    )
    await unwrap(
      'tenants past_due',
      admin.from('tenants').update({ billing_status: status, updated_at: now }).eq('id', tenantId),
    )

    // Only on the TRANSITION into dunning. A single failed charge produces more
    // than one past_due event (the failed invoice and the subscription's own
    // status change), and a redelivery produces another — mailing on each would
    // send a school three copies of the same bad news. Best-effort besides: a
    // mail failure must not undo the writes above by 500-ing, which would have
    // the provider redeliver an event we had already applied.
    if (stored?.status !== 'past_due') {
      try {
        await notifyPaymentFailed(admin, tenantId, sendEmailFn)
      } catch (emailErr) {
        console.error('[platform-webhook] failed to send payment-failed email:', emailErr)
      }
    }
    return
  }

  // Which plan the checkout was for rides in our own metadata. That metadata is
  // set once, at creation, and the provider then echoes it on EVERY later event
  // for the life of the subscription — so trusting it past the first write
  // would rewrite a stale plan_id over a legitimate portal plan change and
  // suppress the reconciliation below. It is therefore read only while the
  // tenant has no plan on file; from then on the price is the source of truth
  // and `applyPortalPlanChange` maps it, with downgrade limits enforced.
  //
  // A self-managed rail is the exception: it has no subscription object for the
  // provider to echo stale metadata from. Each Binance order / Solana transfer
  // is minted for one specific purchase and carries that purchase's plan, so a
  // school moving from Starter to Pro would otherwise have its Pro payment
  // extend its Starter period.
  const selfManaged = !!PROVIDER_CAPABILITIES[provider as PaymentProvider]?.selfManagedPeriod
  const isFirstActivation = !stored?.plan_id
  const trustMetadataPlan = isFirstActivation || selfManaged
  const planId = trustMetadataPlan ? (event.metadata?.plan_id ?? event.metadata?.planId) : undefined
  const planSlug = trustMetadataPlan
    ? (event.metadata?.plan_slug ?? event.metadata?.planSlug)
    : undefined
  const interval = event.interval ?? mapInterval(event.metadata?.interval)

  // Providers that bill on a schedule report the period they just charged for.
  // The ones WE own report nothing, and a subscription with a NULL
  // current_period_end never lapses, never reminds and shows no next-payment
  // date — it is the whole difference between a paid month and a free one.
  const derived =
    selfManaged && !event.periodEnd && status === 'active'
      ? selfManagedPeriod(stored?.current_period_end, interval, new Date(now))
      : null

  const effectiveStart = periodStart ?? derived?.start.toISOString()
  const effectiveEnd = periodEnd ?? derived?.end.toISOString()

  // The plan the ROW must carry, which is a different question from `planId`
  // above. That one answers "is this event moving the school to a new plan?" and
  // is deliberately undefined on every event after the first; this one answers
  // "what plan is this subscription on?", which on those same events is simply
  // the plan already stored.
  //
  // They have to be separate because the upsert below needs a non-NULL plan_id
  // on EVERY write. PostgREST sends `INSERT … ON CONFLICT DO UPDATE`, and
  // Postgres NOT NULL-checks the proposed insert tuple before it ever resolves
  // the conflict — so omitting plan_id on what is logically an update fails the
  // whole statement, not just that column. Sharing one variable made every
  // Stripe `customer.subscription.updated` and `invoice.paid` after the first
  // one throw, which meant: `current_period_end` stayed NULL forever (the
  // checkout event carries no period, only the subscription event does), the
  // period never advanced on renewal, and the provider kept retrying a 500
  // until it disabled the endpoint (#605).
  const rowPlanId =
    planId ?? stored?.plan_id ?? (await planIdForPrice(admin, provider, event.providerPriceId))

  if (!rowPlanId) {
    // Nothing to write a subscription row against, and a row without a plan
    // cannot exist. Dropping the event beats throwing: a 500 here would have the
    // provider redeliver an event we can never apply.
    console.warn(
      `[platform-webhook] ${event.type} on ${provider} for tenant ${tenantId} resolved no plan — ignoring`,
    )
    return
  }

  const subscriptionPatch: Record<string, unknown> = {
    status,
    payment_provider: provider,
    plan_id: rowPlanId,
    updated_at: now,
    ...(event.providerSubscriptionId ? { provider_subscription_id: event.providerSubscriptionId } : {}),
    ...(event.providerCustomerId ? { provider_customer_id: event.providerCustomerId } : {}),
    ...(interval ? { interval } : {}),
    ...(effectiveStart ? { current_period_start: effectiveStart } : {}),
    ...(effectiveEnd ? { current_period_end: effectiveEnd } : {}),
    ...(event.cancelAtPeriodEnd !== undefined
      ? { cancel_at_period_end: event.cancelAtPeriodEnd, canceled_at: event.canceledAt?.toISOString() ?? null }
      : // A rail that reports nothing about scheduled cancellation still says
        // something by being paid: a fresh period un-cancels, exactly as
        // confirmManualPayment treats a confirmed transfer (#546 §1). Without
        // this the school pays for a month and the cron's cancel phase still
        // drops it to free at the end of it.
        derived
        ? { cancel_at_period_end: false, canceled_at: null }
        : {}),
    // Paid means out of dunning. The cron reopens a window if the new period
    // lapses too, but leaving a stale one behind lets phase 3 downgrade a
    // school that has just paid.
    ...(status === 'active' ? { grace_period_end: null } : {}),
    // A paid period resets the reminder stamp so the next cycle can remind
    // again — the same un-cancel semantics confirmManualPayment applies (#546).
    ...(status === 'active' ? { renewal_reminder_sent_at: null } : {}),
  }

  // upsert, not update: a hosted-checkout activation is the first time this
  // tenant has a subscription row at all.
  await unwrap(
    'platform_subscriptions upsert',
    admin
      .from('platform_subscriptions')
      .upsert({ tenant_id: tenantId, ...subscriptionPatch }, { onConflict: 'tenant_id' }),
  )

  if (event.providerCustomerId) {
    await unwrap(
      'tenant_billing_customers upsert',
      admin.from('tenant_billing_customers').upsert(
        {
          tenant_id: tenantId,
          payment_provider: provider,
          provider_customer_id: event.providerCustomerId,
        },
        { onConflict: 'tenant_id,payment_provider' },
      ),
    )
  }

  await unwrap(
    'tenants billing update',
    admin
      .from('tenants')
      .update({
        billing_status: status,
        ...(planSlug ? { plan: planSlug } : {}),
        ...(effectiveEnd ? { billing_period_end: effectiveEnd } : {}),
        updated_at: now,
      })
      .eq('id', tenantId),
  )

  if (planId) {
    await applyRevenueSplit(admin, tenantId, planId, now)
  }

  // Loop E, the money event. Emitted after the subscription + tenant writes
  // land, so it only ever reports a period the school actually holds.
  //
  // THE EMISSION KEY IS THE PERIOD, NOT THE EVENT TYPE, and that is load-
  // bearing: ONE Stripe payment produces THREE dispatchable events with three
  // distinct `providerEventId`s, so the `webhook_events` ledger does not
  // collapse them. A first platform subscription fires
  // `checkout.session.completed` → activated, `customer.subscription.created`
  // → activated, and `invoice.paid` → renewed; each renewal after that fires
  // `invoice.paid` → renewed AND `customer.subscription.updated` → activated.
  // Emitting per event would have reported 3× the first payment and 2× every
  // renewal — the single worst way to be wrong about revenue.
  //
  // A payment buys a PERIOD, so a period that moves forward is exactly one
  // payment. The near-duplicates all carry the same period end, so the first to
  // land emits and the rest are no-ops. `isStalePeriod` above already dropped
  // strictly-older events; this is the equal case. On the self-managed rails
  // `derived` always extends past the stored end, so a Binance/Solana renewal
  // reads as a new period, which is what it is.
  //
  // `is_renewal` (trap 4) is computed HERE because this is the only place that
  // still holds `stored` — the pre-event plan state the upsert above has now
  // overwritten. It matters most on the crypto rails: Binance Pay and Solana
  // have no subscription object, so their SECOND purchase arrives as another
  // `subscription.activated`, identical in shape to the first. Reading that as
  // a new sale would inflate platform growth by every renewal.
  //
  // Three-way, not two: the same plan again is a RENEWAL, a different plan is
  // EXPANSION (or contraction), and no prior plan is genuinely NEW. Collapsing
  // the middle case into "renewal" would hide upgrade revenue, which is the
  // number the whole `plan_limit_hit → plan_changed` funnel exists to move.
  const opensNewPeriod =
    !!effectiveEnd &&
    (!stored?.current_period_end ||
      new Date(effectiveEnd).getTime() > new Date(stored.current_period_end).getTime())

  if (
    opensNewPeriod &&
    (event.type === 'subscription.activated' || event.type === 'subscription.renewed')
  ) {
    const hadPlan = stored?.plan_id != null
    const samePlan = hadPlan && stored?.plan_id === rowPlanId
    void track(
      ANALYTICS_EVENTS.PLATFORM_PAYMENT_SUCCEEDED,
      {
        provider,
        // MAJOR units by the `NormalizedBillingEvent` contract — each adapter
        // converts from its own unit (Lemon Squeezy reports cents).
        amount: event.amount ?? 0,
        interval: interval ?? 'monthly',
        is_renewal: event.type === 'subscription.renewed' || samePlan,
        is_plan_change: hadPlan && !samePlan,
        is_new_subscription: !hadPlan,
        currency: event.currency ?? 'usd',
        event_type: event.type,
        // True for the rails with no subscription object, where "activated"
        // is also what a renewal looks like.
        self_managed_period: selfManaged,
        // False means the provider told us nothing about the amount, so the 0
        // above is an absence rather than a free plan. Stripe's platform mapper
        // reports no amount on any of these events today, so Stripe rows will
        // carry `false` — count them, do not sum them.
        amount_reported: event.amount != null,
        period_end: effectiveEnd,
        ...(planSlug ? { plan: planSlug } : {}),
      },
      // No user: a webhook has no actor, and the money is the school's.
      { tenantId },
    )
  }

  // A paid period clears any cutoff scheduled while the school was over its
  // limits — the same close-out `confirmManualPayment` runs after a confirmed
  // transfer. Best-effort: a reconcile failure must not 500 an event whose
  // subscription and tenant writes have already landed, or the provider
  // redelivers a payment we have applied.
  if (status === 'active') {
    await reconcileAccessCutoffSafely(admin, tenantId)
  }

  // A price change made at the provider (billing portal, or any out-of-band
  // swap) reconciles our plan state with downgrade-limit enforcement. Only
  // meaningful on events that report which price the subscription now sits on,
  // and never on the activation we just wrote the plan for ourselves.
  if (!planId && event.providerPriceId) {
    await applyPortalPlanChange(
      {
        provider,
        tenantId,
        providerSubscriptionId: event.providerSubscriptionId,
        providerPriceId: event.providerPriceId,
        interval,
      },
      { admin, revertToPrice, sendEmailFn },
    )
  }
}
