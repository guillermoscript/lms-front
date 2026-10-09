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

// ── Platform fee ledger (#929) ──────────────────────────────────────────────
//
// The mirror image of the payouts above: on rails where the buyer pays the
// SCHOOL directly (`bearsPlatformFee: false` — manual, Binance personal) the
// platform never touches the money, so its commission accrues as a balance
// the school owes the platform. Mirrors `lib/payments/platform-fee-owed.ts`
// (`feeForTxn`, `computeFeeBalances`, `latestFeeDueBoundary`,
// `overdueFeeBalances`), `statementStatus` (lib/billing/platform-fee-statement)
// and `summarizeConvertedSales` (lib/billing/platform-fee-view); parity is
// asserted in tests/commerce.test.ts.
//
// ONE deliberate difference — hyperinflation currencies. The app reads the
// list from `platform_fee_config.hyperinflation_currencies`, which is
// super-admin-only under RLS, so a school admin's token cannot see it. Here a
// sale is converted when it CARRIES the insert-time USD snapshot
// (`usd_amount IS NOT NULL`): that snapshot is written only for currencies on
// the list at insert time and is frozen afterwards (CHECK + trigger in
// 20261009100000), so the two agree unless a super admin later REMOVES a
// currency from the list — then the ledger would move those already-stamped
// sales back to their own currency bucket and this view would keep them in USD.
// Pass `hyperinflationCurrencies` to get the app's exact rule.

/** Rails where the buyer pays the school directly (`bearsPlatformFee: false`). */
export const FEE_LEDGER_PROVIDERS: readonly string[] = ["manual", "binance_personal"];

/** Days after month close (the 1st, 00:00 UTC) a statement falls due. */
export const FEE_DUE_DAYS = 3;

/** Ledger currency for converted hyperinflation sales. */
export const FEE_LEDGER_USD = "USD";

export interface FeeLedgerTxn {
  /** transactions.payment_provider — the row's own slug, never products.payment_provider. */
  paymentProvider: string | null;
  amount: number;
  refundedAmount: number | null;
  currency: string | null;
  schoolPercentageSnapshot: number | null;
  status: string;
  transactionDate: string;
  /** transactions.usd_amount — insert-time USD snapshot (hyperinflation currencies only). */
  usdAmount?: number | null;
  fxRateToUsd?: number | null;
  fxRateSource?: string | null;
}

export interface FeePaymentRow {
  amount: number;
  currency: string;
  status: string;
}

export interface FeeLedgerOptions {
  /** Current revenue_splits.school_percentage, for rows with a NULL snapshot. */
  fallbackSchoolPercentage?: number;
  /** The app's config list. Omitted: a row is converted iff it carries `usdAmount` (see above). */
  hyperinflationCurrencies?: readonly string[];
  /** Only accrue rows dated strictly before this instant (ms). Payments are always all-time (D4). */
  accruedBefore?: number;
}

export interface FeeLine {
  ledgerCurrency: string;
  sourceCurrency: string;
  kept: number;
  base: number;
  fee: number;
  converted: boolean;
}

const upperCurrency = (c: string | null | undefined) => (c || "usd").toUpperCase();

/** The fee one sale contributes, or null (ineligible rail, not successful, free, refunded to zero). */
export function feeForTxn(txn: FeeLedgerTxn, opts: FeeLedgerOptions = {}): FeeLine | null {
  if (!txn.paymentProvider || !FEE_LEDGER_PROVIDERS.includes(txn.paymentProvider)) return null;
  if (txn.status !== "successful") return null;
  if (!(txn.amount > 0)) return null;
  const kept = netOfRefunds(txn.amount, txn.refundedAmount);
  if (kept <= MONEY_EPSILON) return null;

  const sourceCurrency = upperCurrency(txn.currency);
  const listed = opts.hyperinflationCurrencies
    ? opts.hyperinflationCurrencies.map((c) => c.toUpperCase()).includes(sourceCurrency)
    : true;
  const converted = listed && txn.usdAmount != null;
  const base = converted ? roundMoney(((txn.usdAmount as number) * kept) / txn.amount) : kept;
  const pct = txn.schoolPercentageSnapshot ?? opts.fallbackSchoolPercentage ?? DEFAULT_SCHOOL_PERCENTAGE;
  const schoolShare = roundMoney((base * pct) / 100);
  return {
    ledgerCurrency: converted ? FEE_LEDGER_USD : sourceCurrency,
    sourceCurrency,
    kept,
    base,
    fee: roundMoney(base - schoolShare),
    converted,
  };
}

export interface FeeBalance {
  currency: string;
  /** Commission accrued, net of refunds. */
  accrued: number;
  /** Succeeded fee payments, all time. */
  paid: number;
  /** accrued - paid, 0 at or below half a cent. */
  net_owed: number;
  /** paid - accrued when above half a cent; carried forward, never refunded. */
  overpaid: number;
  /** Sales that accrued a fee. */
  sales: number;
}

/** Per ledger currency, never summed across currencies. Only `succeeded` payments count. */
export function computeFeeBalances(
  txns: readonly FeeLedgerTxn[],
  payments: readonly FeePaymentRow[] = [],
  opts: FeeLedgerOptions = {}
): FeeBalance[] {
  const by = new Map<string, FeeBalance>();
  const bucket = (currency: string) => {
    let b = by.get(currency);
    if (!b) {
      b = { currency, accrued: 0, paid: 0, net_owed: 0, overpaid: 0, sales: 0 };
      by.set(currency, b);
    }
    return b;
  };

  for (const t of txns) {
    if (opts.accruedBefore != null) {
      const at = Date.parse(t.transactionDate);
      if (Number.isNaN(at) || at >= opts.accruedBefore) continue;
    }
    const line = feeForTxn(t, opts);
    if (!line) continue;
    const b = bucket(line.ledgerCurrency);
    b.accrued = roundMoney(b.accrued + line.fee);
    b.sales++;
  }

  for (const p of payments) {
    if (p.status !== "succeeded" || !(p.amount > 0)) continue;
    const b = bucket(upperCurrency(p.currency));
    b.paid = roundMoney(b.paid + p.amount);
  }

  for (const b of by.values()) {
    const owed = roundMoney(b.accrued - b.paid);
    b.net_owed = owed > MONEY_EPSILON ? owed : 0;
    b.overpaid = -owed > MONEY_EPSILON ? roundMoney(-owed) : 0;
  }
  return [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * The latest passed due boundary (UTC): a month closes on the 1st at 00:00 and
 * its statement is due `FEE_DUE_DAYS` later; rows dated before `accrualCutoff`
 * are due by `dueAt`.
 */
export function latestFeeDueBoundary(now: Date): { accrualCutoff: Date; dueAt: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const dueThisMonth = Date.UTC(y, m, 1 + FEE_DUE_DAYS);
  if (now.getTime() > dueThisMonth) {
    return { accrualCutoff: new Date(Date.UTC(y, m, 1)), dueAt: new Date(dueThisMonth) };
  }
  return {
    accrualCutoff: new Date(Date.UTC(y, m - 1, 1)),
    dueAt: new Date(Date.UTC(y, m - 1, 1 + FEE_DUE_DAYS)),
  };
}

/** D4, stateless: fees accrued before the latest passed due boundary minus all-time payments. */
export function overdueFeeBalances(
  txns: readonly FeeLedgerTxn[],
  payments: readonly FeePaymentRow[],
  now: Date,
  opts: Omit<FeeLedgerOptions, "accruedBefore"> = {}
): { currency: string; overdue: number }[] {
  const { accrualCutoff } = latestFeeDueBoundary(now);
  return computeFeeBalances(txns, payments, { ...opts, accruedBefore: accrualCutoff.getTime() })
    .filter((b) => b.net_owed > MONEY_EPSILON)
    .map((b) => ({ currency: b.currency, overdue: b.net_owed }));
}

export type FeeStatementStatus = "paid" | "due" | "overdue";

/** A statement is paid once nothing accrued through its period is still owed. */
export function feeStatementStatus(owedThroughPeriod: number, dueAt: string, now: Date): FeeStatementStatus {
  if (!(owedThroughPeriod > MONEY_EPSILON)) return "paid";
  return now.getTime() > Date.parse(dueAt) ? "overdue" : "due";
}

export interface ConvertedSalesLine {
  /** Sale currency, e.g. VES. */
  currency: string;
  count: number;
  /** Sales net of refunds, in the sale currency. */
  sales_total: number;
  /** USD base those sales were converted to at sale time. */
  usd_total: number;
  /** Distinct frozen rate + source pairs, most recent sale first. */
  rates: { rate: number; source: string | null; date: string }[];
}

/** Hyperinflation sales that landed in the USD bucket, at the rate frozen on each sale. */
export function summarizeConvertedSales(
  txns: readonly FeeLedgerTxn[],
  opts: FeeLedgerOptions = {},
  maxRates = 3
): ConvertedSalesLine[] {
  const by = new Map<string, ConvertedSalesLine & { seen: Set<string> }>();
  const sorted = [...txns].sort((a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate));
  for (const t of sorted) {
    const line = feeForTxn(t, opts);
    if (!line || !line.converted) continue;
    let g = by.get(line.sourceCurrency);
    if (!g) {
      g = { currency: line.sourceCurrency, count: 0, sales_total: 0, usd_total: 0, rates: [], seen: new Set() };
      by.set(line.sourceCurrency, g);
    }
    g.count++;
    g.sales_total = roundMoney(g.sales_total + line.kept);
    g.usd_total = roundMoney(g.usd_total + line.base);
    const rate = t.fxRateToUsd != null && Number.isFinite(t.fxRateToUsd) && t.fxRateToUsd > 0 ? t.fxRateToUsd : null;
    if (rate !== null) {
      const key = `${rate}|${t.fxRateSource ?? ""}`;
      if (!g.seen.has(key) && g.rates.length < maxRates) {
        g.seen.add(key);
        g.rates.push({ rate, source: t.fxRateSource ?? null, date: t.transactionDate });
      }
    }
  }
  return [...by.values()]
    .map((g) => ({ currency: g.currency, count: g.count, sales_total: g.sales_total, usd_total: g.usd_total, rates: g.rates }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** `platform_fee_payments.status` (CHECK `platform_fee_payments_status_check`, #929). */
export const FEE_PAYMENT_STATUSES = ["pending", "succeeded", "failed", "canceled", "reversed"] as const;

/** `tenant_fee_standing.state`; a school with no row is `ok`. */
export const FEE_STANDING_STATES = ["ok", "reminded", "overdue", "blocked"] as const;

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
