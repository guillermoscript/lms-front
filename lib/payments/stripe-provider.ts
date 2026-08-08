/**
 * Stripe Payment Provider Implementation
 */

import Stripe from 'stripe'
import {
  IPaymentProvider,
  PaymentProvider,
  PaymentProduct,
  PaymentPrice,
  CreateProductParams,
  CreatePriceParams,
  UpdateProductParams,
  UpdatePriceParams,
  CreateSubscriptionParams,
  UpdateSubscriptionParams,
  ProviderSubscription,
  ProviderCapabilities,
  NormalizedBillingEvent,
  CreateCheckoutParams,
  CheckoutSession,
  Currency,
  EnsureCustomerParams,
  SubscriptionLifecycleStatus,
  PreviewSubscriptionChangeParams,
  ProrationPreview,
  CustomerPortalSessionParams,
  CancellationResult,
} from './types'
import { SUBSCRIPTION_LIFECYCLE_STATUSES } from './types'

export class StripePaymentProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'stripe'
  // Stripe Connect: native recurring billing + renewal webhooks. We use
  // PaymentIntent/Elements (client_secret), not hosted Checkout, so
  // supportsHostedCheckout is false. Not a Merchant of Record.
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: false,
    supportsPlatformBillingCheckout: true,
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
    createsCatalog: true,
    supportsPlanChange: true,
    supportsCustomerPortal: true, // billingPortal.sessions.create
    supportsProrationPreview: true, // invoices.createPreview
    bearsPlatformFee: true, // application_fee_amount on the Connect charge
    settlesToPlatformAccount: false,
    requiresConnectedAccount: true, // Connect Express — per-tenant account with progressive KYC the school can abandon
  }
  private stripe: Stripe
  /**
   * Signing secret `verifyWebhook` checks against. Defaults to the Connect
   * (student-payments) endpoint's secret; platform billing constructs the
   * provider with `STRIPE_PLATFORM_WEBHOOK_SECRET` instead, because the two
   * endpoints are separate Stripe webhook registrations with separate secrets
   * and verifying one against the other's secret fails closed (#603).
   */
  private webhookSecret?: string

  constructor(apiKey: string, webhookSecret?: string) {
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2026-07-29.dahlia',
    })
    this.webhookSecret = webhookSecret
  }

  /**
   * Convert amount between base units (cents) and major units (dollars)
   */
  convertAmount(amount: number, fromUnit: 'base' | 'major'): number {
    return fromUnit === 'major' ? Math.round(amount * 100) : amount
  }

  /**
   * Create a product in Stripe
   */
  async createProduct(params: CreateProductParams): Promise<PaymentProduct> {
    try {
      // Omit `description` when blank rather than sending ''. Stripe reads an
      // empty string as "unset this parameter" and rejects it outright
      // ("'description' cannot be unset"), so every caller that passes
      // `description ?? ''` — both product create paths do — failed to publish a
      // paid Stripe offering whose course had no description yet. Surfaced while
      // verifying #606; the two callers keep their `|| ''` and this maps it.
      const description = params.description?.trim()
      const stripeProduct = await this.stripe.products.create({
        name: params.name,
        ...(description ? { description } : {}),
        images: params.images || [],
        metadata: params.metadata || {},
      })

      return {
        id: stripeProduct.id,
        name: stripeProduct.name,
        description: stripeProduct.description || '',
        amount: 0, // Products don't have amounts in Stripe, prices do
        currency: 'usd', // Default
        metadata: stripeProduct.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe createProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a product in Stripe
   */
  async updateProduct(productId: string, params: UpdateProductParams): Promise<PaymentProduct> {
    try {
      const stripeProduct = await this.stripe.products.update(productId, {
        name: params.name,
        description: params.description,
        images: params.images,
        active: params.active,
        metadata: params.metadata,
      })

      return {
        id: stripeProduct.id,
        name: stripeProduct.name,
        description: stripeProduct.description || '',
        amount: 0,
        currency: 'usd',
        metadata: stripeProduct.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe updateProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get a product from Stripe
   */
  async getProduct(productId: string): Promise<PaymentProduct> {
    try {
      const stripeProduct = await this.stripe.products.retrieve(productId)

      return {
        id: stripeProduct.id,
        name: stripeProduct.name,
        description: stripeProduct.description || '',
        amount: 0,
        currency: 'usd',
        metadata: stripeProduct.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe getProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Archive (deactivate) a product in Stripe
   */
  async archiveProduct(productId: string): Promise<void> {
    try {
      await this.stripe.products.update(productId, { active: false })
    } catch (error) {
      throw new Error(`Stripe archiveProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Restore (reactivate) a product in Stripe
   */
  async restoreProduct(productId: string): Promise<void> {
    try {
      await this.stripe.products.update(productId, { active: true })
    } catch (error) {
      throw new Error(`Stripe restoreProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a price in Stripe
   */
  async createPrice(params: CreatePriceParams): Promise<PaymentPrice> {
    try {
      const priceData: Stripe.PriceCreateParams = {
        product: params.productId,
        unit_amount: params.amount,
        currency: this.mapCurrency(params.currency),
        metadata: params.metadata || {},
      }

      // Add recurring data for subscriptions
      if (params.type === 'subscription' && params.interval) {
        priceData.recurring = {
          interval: params.interval,
          interval_count: params.intervalCount || 1,
        }
      }

      const stripePrice = await this.stripe.prices.create(priceData)

      return {
        id: stripePrice.id,
        productId: stripePrice.product as string,
        amount: stripePrice.unit_amount || 0,
        currency: params.currency,
        type: params.type,
        interval: params.interval,
        metadata: stripePrice.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe createPrice failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a price in Stripe
   */
  async updatePrice(priceId: string, params: UpdatePriceParams): Promise<PaymentPrice> {
    try {
      const stripePrice = await this.stripe.prices.update(priceId, {
        active: params.active,
        metadata: params.metadata,
      })

      return {
        id: stripePrice.id,
        productId: stripePrice.product as string,
        amount: stripePrice.unit_amount || 0,
        currency: 'usd', // Stripe returns currency in lowercase
        type: stripePrice.recurring ? 'subscription' : 'one_time',
        interval: stripePrice.recurring?.interval as 'month' | 'year' | undefined,
        metadata: stripePrice.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe updatePrice failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get a price from Stripe
   */
  async getPrice(priceId: string): Promise<PaymentPrice> {
    try {
      const stripePrice = await this.stripe.prices.retrieve(priceId)

      return {
        id: stripePrice.id,
        productId: stripePrice.product as string,
        amount: stripePrice.unit_amount || 0,
        currency: 'usd',
        type: stripePrice.recurring ? 'subscription' : 'one_time',
        interval: stripePrice.recurring?.interval as 'month' | 'year' | undefined,
        metadata: stripePrice.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe getPrice failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Archive (deactivate) a price in Stripe
   */
  async archivePrice(priceId: string): Promise<void> {
    try {
      await this.stripe.prices.update(priceId, { active: false })
    } catch (error) {
      throw new Error(`Stripe archivePrice failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a recurring subscription in Stripe.
   * The price must already be a recurring price (created via createPrice with
   * type: 'subscription').
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<ProviderSubscription> {
    try {
      const stripeSub = await this.stripe.subscriptions.create({
        customer: params.providerCustomerId,
        items: [{ price: params.providerPriceId }],
        metadata: params.metadata || {},
      })

      return this.mapSubscription(stripeSub)
    } catch (error) {
      throw new Error(`Stripe createSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Cancel a Stripe subscription — immediately or at the end of the period.
   */
  async cancelSubscription(providerSubId: string, immediate: boolean): Promise<CancellationResult> {
    try {
      if (immediate) {
        await this.stripe.subscriptions.cancel(providerSubId)
        return { mode: 'immediate' }
      } else {
        const subscription = await this.stripe.subscriptions.update(providerSubId, {
          cancel_at_period_end: true,
        })
        const periodEnd = subscription.items.data[0]?.current_period_end
        return {
          mode: 'period_end',
          ...(periodEnd ? { effectiveAt: new Date(periodEnd * 1000) } : {}),
        }
      }
    } catch (error) {
      const stripeError = error as {
        code?: string
        statusCode?: number
        raw?: { code?: string }
      }
      if (
        stripeError.code === 'resource_missing' ||
        stripeError.raw?.code === 'resource_missing' ||
        stripeError.statusCode === 404
      ) {
        return { mode: 'immediate' }
      }
      throw new Error(`Stripe cancelSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Reverse a scheduled cancel-at-period-end — the subscription keeps renewing.
   * No-op-safe if it was never scheduled to cancel.
   */
  async reactivateSubscription(providerSubId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.update(providerSubId, {
        cancel_at_period_end: false,
      })
    } catch (error) {
      throw new Error(`Stripe reactivateSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Retrieve a Stripe subscription's current state.
   */
  async getSubscription(providerSubId: string): Promise<ProviderSubscription> {
    try {
      const stripeSub = await this.stripe.subscriptions.retrieve(providerSubId)
      return this.mapSubscription(stripeSub)
    } catch (error) {
      throw new Error(`Stripe getSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Move a subscription to a different recurring price in place, with proration.
   *
   * Swaps the single billable item on the SAME subscription — the subscription
   * id is unchanged — so a plan change never produces a second live Stripe
   * subscription (no double-billing). Stripe settles the mid-period difference
   * per `proration_behavior` (default `create_prorations`) against the saved
   * default payment method. Mirrors the platform-billing proration at
   * lib/payments/platform-plan-change.ts:155.
   */
  async updateSubscription(
    providerSubId: string,
    params: UpdateSubscriptionParams,
  ): Promise<ProviderSubscription> {
    try {
      const current = await this.stripe.subscriptions.retrieve(providerSubId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemId = (current as any).items?.data?.[0]?.id as string | undefined
      if (!itemId) {
        throw new Error(`subscription ${providerSubId} has no billable item to swap`)
      }
      const updated = await this.stripe.subscriptions.update(providerSubId, {
        items: [{ id: itemId, price: params.newProviderPriceId }],
        proration_behavior: params.prorationBehavior ?? 'create_prorations',
        ...(params.cancelAtPeriodEnd === undefined
          ? {}
          : { cancel_at_period_end: params.cancelAtPeriodEnd }),
        ...(params.metadata ? { metadata: params.metadata } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      return this.mapSubscription(updated)
    } catch (error) {
      throw new Error(`Stripe updateSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Quote what a plan change would cost mid-period, without committing to it.
   *
   * `invoices.createPreview` renders the invoice Stripe WOULD issue for the
   * swap; the proration slice is the sum of the lines Stripe marks as
   * prorations, and `amount_due` is what the next invoice comes to. Both are
   * returned in MAJOR units, so no caller has to know Stripe talks in cents.
   *
   * Read-only: it creates nothing on Stripe's side, so a failure here is safe
   * to swallow and proceed without a quote.
   */
  async previewSubscriptionChange(
    providerSubId: string,
    params: PreviewSubscriptionChangeParams,
  ): Promise<ProrationPreview> {
    try {
      const current = await this.stripe.subscriptions.retrieve(providerSubId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentAny = current as any
      const itemId = currentAny.items?.data?.[0]?.id as string | undefined
      if (!itemId) {
        throw new Error(`subscription ${providerSubId} has no billable item to quote`)
      }
      const customer =
        params.providerCustomerId || (currentAny.customer as string | undefined)
      if (!customer) {
        throw new Error(`subscription ${providerSubId} has no customer to quote against`)
      }

      const preview = await this.stripe.invoices.createPreview({
        customer,
        subscription: providerSubId,
        subscription_details: {
          items: [{ id: itemId, price: params.newProviderPriceId }],
          proration_behavior: params.prorationBehavior ?? 'create_prorations',
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = preview as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lines = (p.lines?.data || []) as any[]
      const prorationAmount = lines
        .filter((l) => l?.parent?.subscription_item_details?.proration)
        .reduce((sum, l) => sum + (l.amount ?? 0), 0)

      return {
        prorationAmount: prorationAmount / 100,
        total: (p.amount_due ?? p.total ?? 0) / 100,
        currency: (p.currency || 'usd').toUpperCase(),
      }
    } catch (error) {
      throw new Error(`Stripe previewSubscriptionChange failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Mint a session URL for Stripe's hosted billing portal, where a school admin
   * can update its card, read invoices and manage the subscription itself.
   *
   * The only provider we integrate that has such a page (hence
   * `supportsCustomerPortal`) — everything else is managed by the in-app
   * controls on the billing screen.
   */
  async createCustomerPortalSession(
    params: CustomerPortalSessionParams,
  ): Promise<{ url: string }> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: params.providerCustomerId,
        return_url: params.returnUrl,
      })
      return { url: session.url }
    } catch (error) {
      throw new Error(`Stripe createCustomerPortalSession failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Start a payment. The missing "creation" path that stores a real
   * provider_subscription_id (issue #280, Phase 2).
   *
   * - mode 'subscription' → creates a Stripe Subscription on the recurring
   *   price with `payment_behavior: 'default_incomplete'`, so the first
   *   invoice's PaymentIntent is confirmed client-side. Connect destination
   *   charges + `application_fee_percent` keep the existing revenue split.
   *   `providerRef` is the Subscription id — store it at creation so renewal /
   *   cancel webhooks can match the row.
   * - mode 'one_time' → a PaymentIntent (kept for parity / future product use).
   *
   * Both return `kind: 'client_secret'`; the existing Stripe Elements
   * confirmation on the client works unchanged for either.
   */
  /**
   * Create a stored Stripe Customer for card-on-file recurring billing.
   *
   * Platform billing needs one before a hosted subscription Checkout Session;
   * the caller persists the id (`tenant_billing_customers` for a school,
   * `profiles.stripe_customer_id` for a student) and passes it back, so this
   * only ever creates.
   */
  async ensureCustomer(params: EnsureCustomerParams): Promise<{ providerCustomerId: string }> {
    try {
      const customer = await this.stripe.customers.create({
        email: params.email || undefined,
        name: params.name,
        metadata: params.metadata,
      })
      return { providerCustomerId: customer.id }
    } catch (error) {
      throw new Error(`Stripe ensureCustomer failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    try {
      // Hosted subscription checkout on the PLATFORM account — school → platform
      // billing (#603). Distinct from the branch below in three ways that matter:
      // it is a Checkout Session (redirect) rather than a PaymentIntent confirmed
      // with Elements, it takes no Connect `transfer_data` / application fee
      // because the platform IS the seller here, and it creates the subscription
      // itself once the buyer pays, so we never pass `default_incomplete`.
      if (params.hosted && params.mode === 'subscription') {
        if (!params.providerCustomerId) {
          throw new Error('providerCustomerId is required for a hosted Stripe subscription checkout')
        }
        const metadata = { reference: params.reference, ...(params.metadata || {}) }
        const session = await this.stripe.checkout.sessions.create({
          customer: params.providerCustomerId,
          mode: 'subscription',
          line_items: [{ price: params.providerPriceId, quantity: 1 }],
          success_url: params.successUrl,
          cancel_url: params.cancelUrl,
          metadata,
          // Echoed onto the Subscription so `customer.subscription.*` events —
          // which do NOT carry the session — can still resolve the tenant.
          subscription_data: { metadata },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)

        if (!session.url) {
          throw new Error('Stripe returned a checkout session with no URL')
        }
        return {
          kind: 'redirect',
          url: session.url,
          reference: params.reference,
          providerRef: session.id,
        }
      }

      if (params.mode === 'subscription') {
        if (!params.providerCustomerId) {
          throw new Error('providerCustomerId is required for a Stripe subscription')
        }
        const subParams: Record<string, unknown> = {
          customer: params.providerCustomerId,
          items: [{ price: params.providerPriceId }],
          payment_behavior: 'default_incomplete',
          payment_settings: { save_default_payment_method: 'on_subscription' },
          // API 2026-02-25.clover: the first-invoice client secret is exposed via
          // confirmation_secret (Invoice.payment_intent was removed).
          expand: ['latest_invoice.confirmation_secret'],
          metadata: { reference: params.reference, ...(params.metadata || {}) },
        }
        if (params.applicationFeePercent && params.applicationFeePercent > 0) {
          subParams.application_fee_percent = params.applicationFeePercent
        }
        if (params.destinationAccount) {
          subParams.transfer_data = { destination: params.destinationAccount }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = await this.stripe.subscriptions.create(subParams as any)
        // latest_invoice is expanded; cast across API-version type differences.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = (sub as any).latest_invoice as any
        const clientSecret =
          invoice?.confirmation_secret?.client_secret ??
          invoice?.payment_intent?.client_secret ?? // fallback for older API versions
          undefined

        return {
          kind: 'client_secret',
          clientSecret,
          reference: params.reference,
          providerRef: sub.id,
        }
      }

      // one_time
      const piParams: Record<string, unknown> = {
        amount: params.amount,
        currency: params.currency,
        automatic_payment_methods: { enabled: true },
        metadata: { reference: params.reference, ...(params.metadata || {}) },
      }
      if (params.providerCustomerId) piParams.customer = params.providerCustomerId
      if (params.destinationAccount) {
        piParams.transfer_data = { destination: params.destinationAccount }
      }
      if (params.applicationFeePercent && params.applicationFeePercent > 0) {
        piParams.application_fee_amount = Math.round((params.amount * params.applicationFeePercent) / 100)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pi = await this.stripe.paymentIntents.create(piParams as any)
      return {
        kind: 'client_secret',
        clientSecret: pi.client_secret ?? undefined,
        reference: params.reference,
        providerRef: pi.id,
      }
    } catch (error) {
      throw new Error(`Stripe createCheckoutSession failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Verify a Stripe webhook signature against STRIPE_WEBHOOK_SECRET (the Connect
   * student-payments endpoint secret). Used by the unified webhook route.
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<boolean> {
    const secret = this.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) return false
    const signature = headers['stripe-signature'] ?? headers['Stripe-Signature']
    if (!signature) return false
    try {
      this.stripe.webhooks.constructEvent(rawBody, signature, secret)
      return true
    } catch {
      return false
    }
  }

  /**
   * Collapse a Stripe event into our internal billing vocabulary. Called AFTER
   * verifyWebhook, so a plain JSON parse of the (already trusted) body is safe.
   * Returns null for event types the unified layer does not model.
   */
  async normalizeWebhookEvent(rawBody: string): Promise<NormalizedBillingEvent | null> {
    let event: Stripe.Event
    try {
      event = JSON.parse(rawBody) as Stripe.Event
    } catch {
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (event.data?.object ?? {}) as any
    const eventId = event.id
    const toDate = (unix?: number) => (unix ? new Date(unix * 1000) : undefined)
    // API 2026-02-25.clover: current_period_end moved off the Subscription onto
    // its items; the Invoice's subscription moved under parent.subscription_details.
    // API 2026-02-25.clover moved the periods off the Subscription onto its
    // items. The `??` fallbacks read the pre-clover shape so a replayed old
    // payload — or an account still pinned to an older version, which is what
    // `stripe listen` replays by default — still resolves a period instead of
    // silently recording none.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subPeriodEnd = (s: any) =>
      toDate(s?.items?.data?.[0]?.current_period_end ?? s?.current_period_end)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subPeriodStart = (s: any) =>
      toDate(s?.items?.data?.[0]?.current_period_start ?? s?.current_period_start)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoiceSubId = (inv: any): string | undefined => {
      const sub = inv?.parent?.subscription_details?.subscription ?? inv?.subscription
      return (typeof sub === 'string' ? sub : sub?.id) ?? undefined
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customerId = (o: any): string | undefined =>
      typeof o?.customer === 'string' ? o.customer : (o?.customer?.id ?? undefined)
    const mapStatus = (s: unknown): SubscriptionLifecycleStatus | undefined =>
      typeof s === 'string' && SUBSCRIPTION_LIFECYCLE_STATUSES.includes(s as SubscriptionLifecycleStatus)
        ? (s as SubscriptionLifecycleStatus)
        : undefined
    // Subscription detail platform billing stores (#603). The student loop
    // ignores every one of these; they exist so the applier never has to call
    // back into Stripe to learn what the event already carried.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subDetail = (s: any) => {
      const item = s?.items?.data?.[0]
      const recurring = item?.price?.recurring?.interval
      return {
        providerCustomerId: customerId(s),
        providerPriceId: item?.price?.id as string | undefined,
        providerSubscriptionItemId: item?.id as string | undefined,
        periodStart: subPeriodStart(s),
        periodEnd: subPeriodEnd(s),
        interval:
          recurring === 'year' ? ('yearly' as const)
            : recurring === 'month' ? ('monthly' as const)
              : undefined,
        subscriptionStatus: mapStatus(s?.status),
        cancelAtPeriodEnd: typeof s?.cancel_at_period_end === 'boolean' ? s.cancel_at_period_end : undefined,
        canceledAt: toDate(s?.canceled_at),
        metadata: (s?.metadata ?? undefined) as Record<string, string> | undefined,
      }
    }

    switch (event.type) {
      // Platform billing's activation event (#603): the school completes a
      // hosted Checkout Session and Stripe creates the subscription. Our own
      // metadata (tenant/plan/interval) rides on the session, so this is the
      // only event that can bind a brand-new subscription to a tenant.
      // One-time sessions are not modelled — the Connect route owns those.
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription') return null
        const subscriptionId =
          typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id
        if (!subscriptionId) return null
        return {
          type: 'subscription.activated',
          providerEventId: eventId,
          providerSubscriptionId: subscriptionId,
          providerCustomerId: customerId(obj),
          reference: obj.metadata?.reference,
          metadata: (obj.metadata ?? undefined) as Record<string, string> | undefined,
          subscriptionStatus: 'active',
          raw: event,
        }
      }
      case 'customer.subscription.deleted':
        return {
          type: 'subscription.expired',
          providerEventId: eventId,
          providerSubscriptionId: obj.id,
          ...subDetail(obj),
          raw: event,
        }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const detail = subDetail(obj)
        if (obj.status === 'active' || obj.status === 'trialing') {
          return {
            type: 'subscription.activated',
            providerEventId: eventId,
            providerSubscriptionId: obj.id,
            ...detail,
            raw: event,
          }
        }
        if (obj.status === 'past_due') {
          return { type: 'subscription.past_due', providerEventId: eventId, providerSubscriptionId: obj.id, ...detail, raw: event }
        }
        if (obj.status === 'canceled') {
          return { type: 'subscription.canceled', providerEventId: eventId, providerSubscriptionId: obj.id, ...detail, raw: event }
        }
        // `incomplete` / `unpaid` / `paused` / anything Stripe adds later. These
        // used to normalize to null — silence — which left a subscription that
        // is demonstrably not paying reading as healthy on every screen. They
        // map to the "needs attention, not terminal" bucket instead, exactly as
        // the Stripe-shaped platform route did before #603, and `past_due`
        // revokes no access on either side (the status-change trigger matches
        // neither of its branches).
        if (typeof obj.status !== 'string') return null
        return {
          type: 'subscription.past_due',
          providerEventId: eventId,
          providerSubscriptionId: obj.id,
          ...detail,
          raw: event,
        }
      }
      // `invoice.paid` and `invoice.payment_succeeded` are near-duplicates that
      // both fire on a renewal; platform billing was registered for the former,
      // the student loop for the latter. Both mean the same thing to us.
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        return {
          type: 'subscription.renewed',
          providerEventId: eventId,
          providerSubscriptionId: invoiceSubId(obj),
          providerCustomerId: customerId(obj),
          periodStart: toDate(obj.lines?.data?.[0]?.period?.start ?? obj.period_start),
          periodEnd: toDate(obj.lines?.data?.[0]?.period?.end ?? obj.period_end),
          subscriptionStatus: 'active',
          raw: event,
        }
      case 'invoice.payment_failed':
        return {
          type: 'subscription.past_due',
          providerEventId: eventId,
          providerSubscriptionId: invoiceSubId(obj),
          raw: event,
        }
      case 'charge.refunded':
        return {
          type: 'refund.succeeded',
          providerEventId: eventId,
          providerPaymentId: obj.payment_intent ?? undefined,
          raw: event,
        }
      case 'payment_intent.succeeded':
        return {
          type: 'payment.succeeded',
          providerEventId: eventId,
          providerPaymentId: obj.id,
          reference: obj.metadata?.transactionId,
          raw: event,
        }
      case 'payment_intent.payment_failed':
        return {
          type: 'payment.failed',
          providerEventId: eventId,
          providerPaymentId: obj.id,
          reference: obj.metadata?.transactionId,
          raw: event,
        }
      default:
        return null
    }
  }

  /**
   * Map a Stripe subscription to our provider-agnostic shape.
   * Stripe API v2025 types moved current_period_end onto items — cast to read it.
   */
  private mapSubscription(stripeSub: Stripe.Subscription): ProviderSubscription {
    const status: ProviderSubscription['status'] =
      stripeSub.status === 'active' || stripeSub.status === 'trialing'
        ? 'active'
        : stripeSub.status === 'past_due'
          ? 'past_due'
          : 'canceled'

    // API 2026-02-25.clover: current_period_end lives on the subscription item.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodEndUnix = (stripeSub as any).items?.data?.[0]?.current_period_end ?? 0
    return {
      id: stripeSub.id,
      status,
      currentPeriodEnd: new Date(periodEndUnix * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    }
  }

  /**
   * Map our currency types to Stripe currency codes
   */
  private mapCurrency(currency: Currency): string {
    const currencyMap: Record<Currency, string> = {
      usd: 'usd',
      eur: 'eur',
      btc: 'btc', // Stripe doesn't support crypto directly
      eth: 'eth',
      usdt: 'usd', // Fallback to USD for stablecoins
    }
    return currencyMap[currency] || 'usd'
  }
}
