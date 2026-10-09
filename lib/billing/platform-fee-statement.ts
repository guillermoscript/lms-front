/**
 * Platform fee statement (#929, design 2.5): the frozen monthly NON-FISCAL
 * statement a school pays against. Server-only data layer for the statement
 * page and `GET /api/billing/fees/statements/[statementNumber]`.
 *
 * What it renders comes from the FROZEN `platform_fee_statements` row
 * (`fee_amount`, `lines` as of close) — never recomputed from live sales, so a
 * refund after close does not edit a statement already issued (it shows as
 * credit later). Only `status` is live: the debt is the stateless ledger (D4),
 * so a statement is `paid` once everything accrued up to its period end is
 * covered by all-time payments in its currency, `overdue` past `due_at`
 * otherwise, else `due`. Per-currency lines are never summed together.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MONEY_EPSILON } from '@/lib/payments/payouts-owed'
import { computeFeeBalances } from '@/lib/payments/platform-fee-owed'
import { loadFeeConfig, loadTenantFeeLedger } from '@/lib/billing/platform-fee-enforcement'

export const STATEMENT_NUMBER_PATTERN = /^PF-\d{6}-\d+$/

export type FeeStatementStatus = 'paid' | 'due' | 'overdue'

export interface FeeStatementRate {
  /** USD per 1 unit of the source currency, as stored on the sale. */
  rate: number
  /** e.g. `bcv`, or `bcv:stale` when an earlier day's rate was used. */
  source: string | null
}

export interface FeeStatementSourceLine {
  /** The sales' own currency (e.g. VES), upper-case. */
  currency: string
  /** Sales net of refunds at close, in `currency`. */
  salesTotal: number
  salesCount: number
  /** Commission on these sales, in the statement (ledger) currency. */
  fee: number
  /** Converted to USD at sale time (hyperinflation currency). */
  converted: boolean
  /** USD base of the converted sales. */
  usdSubtotal: number | null
  /** Distinct rate + source pairs used by the converted sales. */
  rates: FeeStatementRate[]
}

export interface FeeStatementView {
  statementId: string
  statementNumber: string
  tenantId: string
  tenantName: string | null
  /** Ledger currency of the statement (USD for converted sales). */
  currency: string
  periodStart: string
  periodEnd: string
  issuedAt: string
  dueAt: string
  feeAmount: number
  txnCount: number
  priorAdjustment: number
  lines: FeeStatementSourceLine[]
  /** Payments received as of close (all time, this currency). */
  paymentsTotalAtClose: number | null
  /** Balance owed as of close, this currency. */
  closingBalance: number | null
  status: FeeStatementStatus
  /** Always true in v1 — "Statement, not a tax invoice" (2.5). */
  nonFiscal: true
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Parse the frozen `lines` JSONB written by the cron's close phase. Tolerant of missing keys. */
export function parseStatementLines(raw: unknown): {
  lines: FeeStatementSourceLine[]
  paymentsTotal: number | null
  closingBalance: number | null
} {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const sources = obj.sources && typeof obj.sources === 'object' ? (obj.sources as Record<string, unknown>) : {}
  const lines: FeeStatementSourceLine[] = Object.entries(sources)
    .map(([currency, v]) => {
      const s = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
      const rates = Array.isArray(s.rates)
        ? (s.rates as unknown[])
            .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}))
            .map((r) => ({ rate: num(r.rate) ?? 0, source: typeof r.source === 'string' ? r.source : null }))
            .filter((r) => r.rate > 0)
        : []
      return {
        currency: currency.toUpperCase(),
        salesTotal: num(s.sales_total) ?? 0,
        salesCount: num(s.sales_count) ?? 0,
        fee: num(s.fee) ?? 0,
        converted: s.converted === true,
        usdSubtotal: num(s.usd_subtotal),
        rates,
      }
    })
    .sort((a, b) => a.currency.localeCompare(b.currency))
  return { lines, paymentsTotal: num(obj.payments_total), closingBalance: num(obj.closing_balance) }
}

/** Status from the live ledger (D4). `owedThroughPeriod` = accrued up to period end minus all-time payments. */
export function statementStatus(owedThroughPeriod: number, dueAt: string, now: Date): FeeStatementStatus {
  if (!(owedThroughPeriod > MONEY_EPSILON)) return 'paid'
  return now.getTime() > Date.parse(dueAt) ? 'overdue' : 'due'
}

interface StatementRow {
  statement_id: string
  statement_number: string
  tenant_id: string
  currency: string
  period_start: string
  period_end: string
  issued_at: string
  due_at: string
  fee_amount: number | string
  txn_count: number | string
  prior_adjustment: number | string | null
  lines: unknown
  tenants?: { name: string | null } | { name: string | null }[] | null
}

/** Find a statement by number. Returns null when it does not exist (callers authorize by tenant). */
export async function loadFeeStatement(
  admin: SupabaseClient,
  statementNumber: string,
  now: Date = new Date(),
): Promise<FeeStatementView | null> {
  if (!STATEMENT_NUMBER_PATTERN.test(statementNumber)) return null
  const { data, error } = await admin
    .from('platform_fee_statements')
    .select(
      'statement_id, statement_number, tenant_id, currency, period_start, period_end, issued_at, due_at, fee_amount, txn_count, prior_adjustment, lines, tenants(name)',
    )
    .eq('statement_number', statementNumber)
    .maybeSingle()
  if (error) throw new Error(`platform_fee_statements read failed: ${error.message}`)
  if (!data) return null
  const row = data as StatementRow

  // Live status: everything accrued through the period end vs all-time payments.
  const [config, ledger] = await Promise.all([loadFeeConfig(admin), loadTenantFeeLedger(admin, row.tenant_id)])
  const periodEndExclusive = Date.parse(`${row.period_end}T00:00:00Z`) + 24 * 60 * 60 * 1000
  const bucket = computeFeeBalances(ledger.txns, ledger.payments, {
    fallbackSchoolPercentage: ledger.fallbackSchoolPercentage ?? undefined,
    hyperinflationCurrencies: config.hyperinflationCurrencies,
    accruedBefore: periodEndExclusive,
  }).find((b) => b.currency === row.currency)

  const parsed = parseStatementLines(row.lines)
  const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants
  return {
    statementId: row.statement_id,
    statementNumber: row.statement_number,
    tenantId: row.tenant_id,
    tenantName: tenant?.name ?? null,
    currency: row.currency,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    feeAmount: Number(row.fee_amount),
    txnCount: Number(row.txn_count),
    priorAdjustment: num(row.prior_adjustment) ?? 0,
    lines: parsed.lines,
    paymentsTotalAtClose: parsed.paymentsTotal,
    closingBalance: parsed.closingBalance,
    status: statementStatus(bucket?.netOwed ?? 0, row.due_at, now),
    nonFiscal: true,
  }
}

/** Statement list for a tenant (newest first), frozen fields only. */
export async function listFeeStatements(
  admin: SupabaseClient,
  tenantId: string,
  limit = 24,
): Promise<
  {
    statementNumber: string
    currency: string
    periodStart: string
    periodEnd: string
    dueAt: string
    feeAmount: number
  }[]
> {
  const { data, error } = await admin
    .from('platform_fee_statements')
    .select('statement_number, currency, period_start, period_end, due_at, fee_amount')
    .eq('tenant_id', tenantId)
    .order('period_start', { ascending: false })
    .order('currency')
    .limit(limit)
  if (error) throw new Error(`platform_fee_statements read failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    statementNumber: r.statement_number as string,
    currency: r.currency as string,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    dueAt: r.due_at as string,
    feeAmount: Number(r.fee_amount),
  }))
}
