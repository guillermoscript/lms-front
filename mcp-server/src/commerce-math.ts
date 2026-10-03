/**
 * Money arithmetic and status vocabulary for the commerce tools (#897).
 *
 * The MCP image is built from `mcp-server/` alone (plus `@lms/core`), so it
 * cannot import the app's `lib/payments/*`. The few rules the commerce tools
 * need are mirrored here, and `tests/commerce.test.ts` runs the same fixtures
 * through the app's own modules (`lib/payments/payouts-owed.ts`,
 * `lib/payments/revenue-share.ts`, `PROVIDER_CAPABILITIES`) so the two cannot
 * drift silently:
 *
 *   - `netOfRefunds` / `roundMoney` / `MONEY_EPSILON` — #547: a partial refund
 *     keeps the row `successful` and only `amount - refunded_amount` counts;
 *     shares are rounded to cents PER TRANSACTION before summing.
 *   - Whether the platform takes a fee is a property of the PROVIDER
 *     (`bearsPlatformFee`), never `revenue_splits.applies_to_providers`.
 *   - The rate is the row's own `school_percentage_snapshot`, falling back to
 *     the tenant's current split only for pre-#496 rows.
 *   - "Payouts owed" covers only providers that settle into the PLATFORM's
 *     account (`settlesToPlatformAccount`): there the platform holds 100% and
 *     pays the school its share by hand, as `payouts` rows.
 *
 * Balances are always per currency — never summed across currencies (#497).
 */

/** Used when a tenant has no `revenue_splits` row (mirrors DEFAULT_SCHOOL_PERCENTAGE). */
export const DEFAULT_SCHOOL_PERCENTAGE = 80;

/** Half a cent: a residue below this reads as settled (#547). */
export const MONEY_EPSILON = 0.005;

/** Round to cents, half away from zero, ties to the school (see lib/payments/payouts-owed.ts). */
export function roundMoney(value: number): number {
  const scaled = value * 100;
  return (
    Math.round(
      scaled + (scaled >= 0 ? Number.EPSILON : -Number.EPSILON) * Math.abs(scaled)
    ) / 100
  );
}

/** What was actually kept from a sale: amount minus anything refunded, floored at 0. */
export function netOfRefunds(
  amount: number,
  refundedAmount: number | null | undefined
): number {
  return Math.max(amount - (refundedAmount ?? 0), 0);
}

/** Providers through which the platform takes its cut (`bearsPlatformFee: true`). */
export const FEE_BEARING_PROVIDERS: ReadonlySet<string> = new Set([
  "stripe",
  "paypal",
  "lemonsqueezy",
  "solana",
  "solana_subs",
  "binance",
]);

/** Providers whose money lands in the platform's account (`settlesToPlatformAccount: true`). */
export const PLATFORM_SETTLED_PROVIDERS: ReadonlySet<string> = new Set([
  "paypal",
  "lemonsqueezy",
  "binance",
]);

/**
 * A row predating `payment_provider` carries only a Stripe payment-intent id;
 * anything older with neither is an offline/manual sale (same coalesce the app
 * and `get_platform_revenue` use).
 */
export function resolveProvider(row: {
  paymentProvider?: string | null;
  stripePaymentIntentId?: string | null;
}): string {
  if (row.paymentProvider) return row.paymentProvider;
  return row.stripePaymentIntentId ? "stripe" : "manual";
}

export interface RevenueRow {
  amount: number;
  refundedAmount?: number | null;
  currency?: string | null;
  paymentProvider?: string | null;
  stripePaymentIntentId?: string | null;
  schoolPercentageSnapshot?: number | null;
}

export interface PaidPayout {
  amount: number;
  currency?: string | null;
}

export interface CurrencyRevenue {
  currency: string;
  /** Successful sales, net of refunds, every provider. */
  gross_revenue: number;
  /** The platform's cut, fee-bearing providers only. */
  platform_fees: number;
  /** gross_revenue - platform_fees: what the school keeps or is owed. */
  school_revenue: number;
  /** Sales collected into the PLATFORM's account (PayPal / Lemon Squeezy / Binance Pay), net of refunds. */
  platform_collected: number;
  /** The school's share of `platform_collected`. */
  owed_gross: number;
  /** Manual payouts already marked paid in this currency. */
  already_paid: number;
  /** owed_gross - already_paid, 0 below half a cent. */
  net_owed: number;
  /** already_paid - owed_gross when positive — carried forward, never clawed back. */
  overpaid: number;
  /** Successful transaction count in this currency. */
  transactions: number;
}

/**
 * Per-currency revenue split + the platform's outstanding balance to this
 * school. Callers pass ONLY `successful` transactions — a fully refunded row is
 * `refunded` and leaves both figures, which is what corrects a balance whose
 * payout already went out (#511: its payout stays inside `already_paid`).
 */
export function computeSchoolRevenue(
  rows: RevenueRow[],
  paidPayouts: PaidPayout[],
  fallbackSchoolPercentage: number
): CurrencyRevenue[] {
  const byCurrency = new Map<
    string,
    {
      gross: number;
      fees: number;
      collected: number;
      owed: number;
      paid: number;
      count: number;
    }
  >();
  const bucket = (currency: string) => {
    let entry = byCurrency.get(currency);
    if (!entry) {
      entry = { gross: 0, fees: 0, collected: 0, owed: 0, paid: 0, count: 0 };
      byCurrency.set(currency, entry);
    }
    return entry;
  };

  for (const row of rows) {
    const entry = bucket(row.currency || "usd");
    const kept = netOfRefunds(Number(row.amount ?? 0), row.refundedAmount);
    const pct = row.schoolPercentageSnapshot ?? fallbackSchoolPercentage;
    const schoolShare = roundMoney((kept * pct) / 100);
    const provider = resolveProvider(row);

    entry.count += 1;
    entry.gross += kept;
    // (kept - school's share), not kept × platform% — bit-for-bit the figure
    // the payout side reports, so the two can never drift by a rounding step.
    if (FEE_BEARING_PROVIDERS.has(provider)) entry.fees += kept - schoolShare;
    // payouts-owed reads only rows whose provider is SET to a platform-settled
    // slug; a legacy NULL never resolves to one, so `resolveProvider` agrees.
    if (row.paymentProvider && PLATFORM_SETTLED_PROVIDERS.has(row.paymentProvider)) {
      entry.collected += kept;
      entry.owed += schoolShare;
    }
  }

  for (const payout of paidPayouts) {
    bucket(payout.currency || "usd").paid += Number(payout.amount ?? 0);
  }

  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, e]) => {
      const gross = roundMoney(e.gross);
      const fees = roundMoney(e.fees);
      const owed = roundMoney(e.owed);
      const paid = roundMoney(e.paid);
      const difference = roundMoney(owed - paid);
      return {
        currency,
        gross_revenue: gross,
        platform_fees: fees,
        school_revenue: roundMoney(gross - fees),
        platform_collected: roundMoney(e.collected),
        owed_gross: owed,
        already_paid: paid,
        net_owed: difference > MONEY_EPSILON ? difference : 0,
        overpaid: -difference > MONEY_EPSILON ? -difference : 0,
        transactions: e.count,
      };
    });
}

// ── Status vocabularies ─────────────────────────────────────────────────────

/** `payment_requests.status` (CHECK constraint `payment_requests_status_check`). */
export const PAYMENT_REQUEST_STATUSES = [
  "pending",
  "contacted",
  "payment_received",
  "completed",
  "cancelled",
] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

/** Still awaiting the school: what the admin queue shows by default. */
export const OPEN_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] = [
  "pending",
  "contacted",
  "payment_received",
];

/**
 * A request can be marked "payment received" while it is still awaiting
 * payment. The dashboard's quick action requires `contacted`, but its edit
 * dialog sets any status, and a student can report a transfer (#802) before
 * the school ever sent instructions — so both pre-payment states qualify.
 */
export const CONFIRMABLE_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] = [
  "pending",
  "contacted",
];

/**
 * A request can be rejected (cancelled) until it is settled. `completed` is
 * excluded on purpose: that request already produced a transaction and the
 * student's access, and flipping its label would revoke neither.
 */
export const REJECTABLE_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] = [
  "pending",
  "contacted",
  "payment_received",
];

/** `transactions.status` (enum `transaction_status`). */
export const TRANSACTION_STATUSES = [
  "pending",
  "successful",
  "failed",
  "archived",
  "canceled",
  "refunded",
] as const;

/** `subscriptions.subscription_status` (enum `subscription_status`). */
export const SUBSCRIPTION_STATUSES = [
  "active",
  "canceled",
  "expired",
  "renewed",
  "past_due",
] as const;

/** `renewed` and `past_due` count as live alongside `active` (CLAUDE.md, #545). */
export const LIVE_SUBSCRIPTION_STATUSES: readonly (typeof SUBSCRIPTION_STATUSES)[number][] = [
  "active",
  "renewed",
  "past_due",
];

/** Why a requested payment-request transition is refused, or null when it is allowed. */
export function paymentRequestTransitionError(
  action: "confirm" | "reject",
  current: string
): string | null {
  const allowed =
    action === "confirm"
      ? CONFIRMABLE_PAYMENT_REQUEST_STATUSES
      : REJECTABLE_PAYMENT_REQUEST_STATUSES;
  if ((allowed as readonly string[]).includes(current)) return null;
  if (action === "confirm") {
    if (current === "payment_received") return null; // idempotent: already confirmed
    return `Request is '${current}' — only a pending or contacted request can be marked as paid.`;
  }
  if (current === "cancelled") return null; // idempotent: already rejected
  return `Request is '${current}' — a completed request already granted access and cannot be rejected. Refund it outside the platform instead.`;
}
