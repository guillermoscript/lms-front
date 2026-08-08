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
import { downgradeTenantToFreeIfCurrent } from '@/lib/billing/downgrade-tenant'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { applyPortalPlanChange } from '@/lib/payments/platform-plan-change'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import type {
  NormalizedBillingEvent,
  PaymentProvider,
  SubscriptionLifecycleStatus,
} from '@/lib/payments/types'
import {
  isCurrentPlatformSubscriptionIdentity,
  promotePlatformSubscriptionSwitch,
  reconcilePlatformSubscriptionSwitch,
  recordSupersededTerminalEvent,
  switchIdFromMetadata,
} from '@/lib/billing/platform-subscription-switch'

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

const TERMINAL_STORED_STATUS = new Set<string>(['canceled', 'incomplete_expired'])

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
  const currentTenant = (row as { tenant_id: string } | null)?.tenant_id
  if (currentTenant) return currentTenant

  const sourceSwitch = await unwrap(
    'platform_subscription_switches lookup by source identity',
    admin
      .from('platform_subscription_switches')
      .select('tenant_id')
      .eq('source_payment_provider', provider)
      .eq('source_provider_subscription_id', event.providerSubscriptionId)
      .in('state', ['cancellation_pending', 'cancellation_retry', 'cancellation_scheduled'])
      .limit(1)
      .maybeSingle(),
  )
  return (sourceSwitch as { tenant_id: string } | null)?.tenant_id ?? null
}

interface StoredSubscription {
  plan_id: string | null
  status: string | null
  current_period_end: string | null
  payment_provider: string | null
  provider_subscription_id: string | null
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
    if (!event.providerSubscriptionId) {
      console.warn(`[platform-webhook] ${event.type} on ${provider} has no subscription identity — ignoring`)
      return
    }
    const current = await isCurrentPlatformSubscriptionIdentity(
      admin,
      tenantId,
      provider,
      event.providerSubscriptionId,
    )
    if (!current) {
      const superseded = await recordSupersededTerminalEvent(
        admin,
        provider,
        event.providerSubscriptionId,
      )
      console.log(
        `[platform-webhook] ${event.type} for non-current ${provider}/${event.providerSubscriptionId} ` +
          (superseded ? 'completed switch cleanup' : 'was ignored'),
      )
      return
    }
    const platformFee = await downgradeTenantToFreeIfCurrent(
      admin,
      tenantId,
      provider,
      event.providerSubscriptionId,
    )
    if (platformFee == null) return
    console.log(
      `[platform-webhook] subscription ${event.type} on ${provider}, tenant ${tenantId} downgraded to free (fee=${platformFee}%)`,
    )
    return
  }

  const stored = (await unwrap(
    'platform_subscriptions lookup',
    admin
      .from('platform_subscriptions')
      .select('plan_id, status, current_period_end, payment_provider, provider_subscription_id')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  )) as StoredSubscription | null

  const switchId = switchIdFromMetadata(event.metadata)
  const isSwitchActivation = event.type === 'subscription.activated' && !!switchId
  const selfManaged = !!PROVIDER_CAPABILITIES[provider as PaymentProvider]?.selfManagedPeriod
  const isSameRailSelfManagedRenewal =
    event.type === 'subscription.activated' &&
    selfManaged &&
    stored?.payment_provider === provider &&
    !!event.providerSubscriptionId
  const isFreshActivation =
    event.type === 'subscription.activated' &&
    (!stored?.provider_subscription_id ||
      (stored.payment_provider === provider && TERMINAL_STORED_STATUS.has(stored.status ?? ''))) &&
    !!(event.metadata?.plan_id ?? event.metadata?.planId)
  if (
    !isSwitchActivation &&
    !isSameRailSelfManagedRenewal &&
    !isFreshActivation &&
    stored?.provider_subscription_id
  ) {
    const currentIdentity =
      stored.payment_provider === provider &&
      !!event.providerSubscriptionId &&
      stored.provider_subscription_id === event.providerSubscriptionId
    if (!currentIdentity) {
      console.log(
        `[platform-webhook] ${event.type} for non-current ${provider}/${event.providerSubscriptionId ?? 'missing'} ignored`,
      )
      return
    }
  }

  if (!isSwitchActivation && isStalePeriod(stored, tenantId, event.periodEnd)) return

  const status = storedStatus(event.subscriptionStatus, STATUS_BY_TYPE[event.type] ?? 'active')
  const periodStart = event.periodStart?.toISOString()
  const periodEnd = event.periodEnd?.toISOString()

  if (event.type === 'subscription.past_due') {
    // The transition test lives in the WHERE clause, not in a read of `stored`:
    // a single failed charge produces more than one past_due event (the failed
    // invoice and the subscription's own status change), and two of them
    // dispatching concurrently would BOTH pass a read-then-check against the
    // same 'active' snapshot. Only the update that actually flips the row wins
    // the right to notify.
    const transitioned = (await unwrap(
      'platform_subscriptions past_due',
      admin
        .from('platform_subscriptions')
        .update({ status, updated_at: now })
        .eq('tenant_id', tenantId)
        .neq('status', 'past_due')
        .select('tenant_id'),
    )) as { tenant_id: string }[] | null
    await unwrap(
      'tenants past_due',
      admin.from('tenants').update({ billing_status: status, updated_at: now }).eq('id', tenantId),
    )

    // Only on the TRANSITION into dunning — mailing on each event would send a
    // school three copies of the same bad news. `!stored` keeps the pre-#625
    // behavior of still warning a tenant that has no subscription row at all.
    // Best-effort besides: a mail failure must not undo the writes above by
    // 500-ing, which would have the provider redeliver an event we had already
    // applied.
    if ((transitioned?.length ?? 0) > 0 || !stored) {
      if (!event.providerEventId) {
        throw new Error(`platform dispatch ${event.type}: provider event id is required for notification dedupe`)
      }
      try {
        const shouldNotify = await unwrap(
          'payment-failed notification claim',
          admin.rpc('claim_webhook_business_effect', {
            _provider: `platform:${provider}`,
            _provider_event_id: event.providerEventId,
            _effect_type: 'platform_payment_failed_email',
            _target_id: tenantId,
          }),
        )
        if (shouldNotify) await notifyPaymentFailed(admin, tenantId, sendEmailFn)
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
  const isFirstActivation = !stored?.plan_id
  const trustMetadataPlan = isFirstActivation || selfManaged || isSwitchActivation
  const planId = trustMetadataPlan ? (event.metadata?.plan_id ?? event.metadata?.planId) : undefined
  const planSlug = trustMetadataPlan
    ? (event.metadata?.plan_slug ?? event.metadata?.planSlug)
    : undefined
  const interval = event.interval ?? mapInterval(event.metadata?.interval)

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

  // Providers that bill on a schedule report the period they just charged for.
  // Self-managed rails do not, so period extension and provider-event dedupe
  // happen together in PostgreSQL. This remains correct for A,B,A replay order
  // and for concurrent different payments on the same tenant.
  let effectiveStart = periodStart
  let effectiveEnd = periodEnd
  let derivedPeriod = false
  if (selfManaged && !event.periodEnd && status === 'active' && isSwitchActivation) {
    // A switch activation must NOT stack on the OUTGOING provider's period —
    // the school is abandoning it, so the paid period starts now (#627). It is
    // derived here rather than in apply_self_managed_platform_period because
    // promotePlatformSubscriptionSwitch below is its own atomic writer for the
    // whole switch transition; sending this event through the generic RPC
    // would upsert the row behind the switch machinery's back.
    derivedPeriod = true
    const derived = selfManagedPeriod(null, interval, new Date(now))
    effectiveStart = derived.start.toISOString()
    effectiveEnd = derived.end.toISOString()
  } else if (selfManaged && !event.periodEnd && status === 'active') {
    derivedPeriod = true
    if (!event.providerEventId) {
      throw new Error(`platform dispatch ${event.type}: provider event id is required for period accounting`)
    }
    const rows = (await unwrap(
      'self-managed platform period apply',
      admin.rpc('apply_self_managed_platform_period', {
        _provider: provider,
        _provider_event_id: event.providerEventId,
        _tenant_id: tenantId,
        _plan_id: rowPlanId,
        _plan_slug: planSlug ?? null,
        _interval: interval ?? 'monthly',
        _provider_subscription_id: event.providerSubscriptionId ?? null,
        _provider_customer_id: event.providerCustomerId ?? null,
      }),
    )) as { applied: boolean; period_start: string | null; period_end: string | null }[]
    const result = rows[0]
    if (!result?.period_start || !result.period_end) {
      throw new Error(`self-managed platform period apply returned no durable period for ${tenantId}`)
    }
    effectiveStart = result.period_start
    effectiveEnd = result.period_end

    // The RPC is the sole writer for self-managed subscription, tenant period,
    // plan, cancellation reset and revenue split. Re-running the generic
    // upserts below would let an older worker rewind a newer serialized result.
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
    if (result.applied) await reconcileAccessCutoffSafely(admin, tenantId)
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
        derivedPeriod
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

  if (isSwitchActivation) {
    if (
      PROVIDER_CAPABILITIES[provider as PaymentProvider]?.supportsNativeSubscriptions &&
      !event.providerSubscriptionId
    ) {
      throw new Error(`Replacement activation on ${provider} has no subscription identity`)
    }
    const promoted = await promotePlatformSubscriptionSwitch({
      admin,
      switchId: switchId!,
      tenantId,
      targetProvider: provider as PaymentProvider,
      targetProviderSubscriptionId: event.providerSubscriptionId ?? null,
      targetProviderCustomerId: event.providerCustomerId ?? null,
      targetPlanId: rowPlanId,
      targetStatus: status,
      targetInterval: interval ?? 'monthly',
      targetPeriodStart: effectiveStart ?? null,
      targetPeriodEnd: effectiveEnd ?? null,
    })
    if (!promoted) {
      throw new Error(`Subscription switch ${switchId} no longer matches current billing state`)
    }

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
    if (status === 'active') await reconcileAccessCutoffSafely(admin, tenantId)
    await reconcilePlatformSubscriptionSwitch(admin, switchId!)
    return
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
