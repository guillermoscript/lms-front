/**
 * Server loaders for the school-facing platform fee view (#929, design 4.4):
 * the earnings-page balance card and the dashboard-shell banner. Admin client;
 * callers verify the viewer first. Pure helpers live in `platform-fee-view.ts`.
 *
 *  - Per-currency lines are NEVER summed across currencies.
 *  - The banner fails OPEN (no banner on a read error, never a wrong state)
 *    and is cheap: one PK read, the ledger only when the standing is not `ok`.
 *  - What the school pays is decided by `POST /api/billing/fees/checkout` from
 *    the live ledger; these figures are only what we show.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFeeBalances, type FeeBalance, type FeeLedgerOptions } from '@/lib/payments/platform-fee-owed'
import { loadFeeConfig, loadTenantFeeLedger, type EnforcementMode } from '@/lib/billing/platform-fee-enforcement'
import { statementStatus, type FeeStatementStatus } from '@/lib/billing/platform-fee-statement'
import { isRequestOpen, OPEN_REQUEST_STATUSES } from '@/lib/billing/payment-request-ttl'
import {
  describeFeeBanner,
  payNowBuckets,
  summarizeConvertedSales,
  type ConvertedSalesLine,
  type FeeBannerNotice,
  type FeeStandingSnapshot,
  type FeeStandingState,
  type PayNowBucket,
} from '@/lib/billing/platform-fee-view'

const DAY_MS = 24 * 60 * 60 * 1000

// ─── loaders (admin client; callers verify the viewer first) ───────────────

export interface SchoolFeeStatementSummary {
  statementNumber: string
  currency: string
  periodStart: string
  periodEnd: string
  dueAt: string
  feeAmount: number
  status: FeeStatementStatus
}

export interface SchoolFeeAccount {
  balances: FeeBalance[]
  standing: FeeStandingSnapshot
  enforcementMode: EnforcementMode
  graceDays: number
  converted: ConvertedSalesLine[]
  statements: SchoolFeeStatementSummary[]
  openRequest: { requestId: string; amount: number; currency: string; status: string; createdAt: string } | null
  underReview: number
  payNow: PayNowBucket[]
}

const STANDING_COLUMNS = 'state, overdue_since, blocked_at, enforcement_exempt'

function toStanding(row: Record<string, unknown> | null): FeeStandingSnapshot {
  return {
    state: ((row?.state as FeeStandingState | undefined) ?? 'ok') as FeeStandingState,
    overdueSince: (row?.overdue_since as string | null | undefined) ?? null,
    blockedAt: (row?.blocked_at as string | null | undefined) ?? null,
    enforcementExempt: row?.enforcement_exempt === true,
  }
}

/** Everything the earnings-page balance card needs. Throws on a read error (the card shows retry). */
export async function loadSchoolFeeAccount(
  admin: SupabaseClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<SchoolFeeAccount> {
  const [config, ledger, standingRes, statementsRes, requestRes, reviewRes] = await Promise.all([
    loadFeeConfig(admin),
    loadTenantFeeLedger(admin, tenantId),
    admin.from('tenant_fee_standing').select(STANDING_COLUMNS).eq('tenant_id', tenantId).maybeSingle(),
    admin
      .from('platform_fee_statements')
      .select('statement_number, currency, period_start, period_end, due_at, fee_amount')
      .eq('tenant_id', tenantId)
      .order('period_start', { ascending: false })
      .order('currency')
      .limit(6),
    admin
      .from('platform_payment_requests')
      .select('request_id, amount, currency, status, created_at, expires_at')
      .eq('tenant_id', tenantId)
      .eq('request_type', 'fee')
      .in('status', OPEN_REQUEST_STATUSES as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('platform_fee_payments')
      .select('payment_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .not('review_reason', 'is', null),
  ])
  for (const r of [standingRes, statementsRes, requestRes, reviewRes]) {
    if (r.error) throw new Error(`platform fee account read failed: ${r.error.message}`)
  }

  const opts: FeeLedgerOptions = {
    fallbackSchoolPercentage: ledger.fallbackSchoolPercentage ?? undefined,
    hyperinflationCurrencies: config.hyperinflationCurrencies,
  }
  const balances = computeFeeBalances(ledger.txns, ledger.payments, opts)

  const statements = (statementsRes.data ?? []).map((s) => {
    const periodEndExclusive = Date.parse(`${s.period_end}T00:00:00Z`) + DAY_MS
    const bucket = computeFeeBalances(ledger.txns, ledger.payments, {
      ...opts,
      accruedBefore: periodEndExclusive,
    }).find((b) => b.currency === s.currency)
    return {
      statementNumber: s.statement_number as string,
      currency: s.currency as string,
      periodStart: s.period_start as string,
      periodEnd: s.period_end as string,
      dueAt: s.due_at as string,
      feeAmount: Number(s.fee_amount),
      status: statementStatus(bucket?.netOwed ?? 0, s.due_at as string, now),
    }
  })

  // Same openness test as the checkout route's 409 (expired transfers are not open).
  const req = ((requestRes.data ?? []) as { request_id: string; amount: number; currency: string; status: string; created_at: string; expires_at: string | null }[])
    .find((r) => isRequestOpen(r, now))
  return {
    balances,
    standing: toStanding(standingRes.data as Record<string, unknown> | null),
    enforcementMode: config.enforcementMode,
    graceDays: config.feeGraceDays,
    converted: summarizeConvertedSales(ledger.txns, opts),
    statements,
    openRequest: req
      ? {
          requestId: req.request_id as string,
          amount: Number(req.amount),
          currency: String(req.currency).toUpperCase(),
          status: req.status as string,
          createdAt: req.created_at as string,
        }
      : null,
    underReview: reviewRes.count ?? 0,
    payNow: payNowBuckets(balances, { cardConfigured: Boolean(process.env.STRIPE_SECRET_KEY) }),
  }
}

/**
 * The dashboard-shell banner. Fails OPEN (null) on any error. Loads the ledger
 * only when the standing is not `ok`, so the common case is one PK read.
 */
export async function loadFeeBannerNotice(admin: SupabaseClient, tenantId: string): Promise<FeeBannerNotice | null> {
  try {
    const { data, error } = await admin
      .from('tenant_fee_standing')
      .select(STANDING_COLUMNS)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error || !data) return null
    const standing = toStanding(data as Record<string, unknown>)
    if (standing.state === 'ok') return null

    const [config, ledger, latest] = await Promise.all([
      loadFeeConfig(admin),
      loadTenantFeeLedger(admin, tenantId),
      admin
        .from('platform_fee_statements')
        .select('due_at')
        .eq('tenant_id', tenantId)
        .order('due_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const balances = computeFeeBalances(ledger.txns, ledger.payments, {
      fallbackSchoolPercentage: ledger.fallbackSchoolPercentage ?? undefined,
      hyperinflationCurrencies: config.hyperinflationCurrencies,
    })
    return describeFeeBanner({
      standing,
      balances,
      enforcementMode: config.enforcementMode,
      graceDays: config.feeGraceDays,
      latestDueAt: (latest.data?.due_at as string | undefined) ?? null,
    })
  } catch (err) {
    console.error('[platform-fees] banner read failed:', err instanceof Error ? err.message : err)
    return null
  }
}
