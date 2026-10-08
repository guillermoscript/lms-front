/**
 * Platform fee dunning: the work behind `/api/cron/enforce-platform-fees`
 * (#929, design section 3). The route is a thin auth + Sentry wrapper; the
 * phases live here so they are unit-testable against an in-memory store.
 *
 * Phases, per tenant, every one status-gated so a rerun is a no-op:
 *   0. Close    — after the month boundary, freeze last month's statement per
 *                 ledger currency (UNIQUE (tenant, currency, period_start)),
 *                 then email it (stamp issued_email_sent_at on success).
 *   1. Remind   — the day before due_at, open balance, reminder not stamped
 *                 → email + stamp; standing ok → reminded.
 *   2. Overdue  — D4 stateless test (fees accrued before the latest passed due
 *                 boundary minus all-time payments > EPS) → standing overdue
 *                 + overdue_since; overdue email until its stamp is set.
 *   3. Block    — ONLY when enforcement_mode = 'enforce': overdue for more than
 *                 fee_grace_days and any overdue bucket >= min_blocking_balance
 *                 → blocked_at. At most FEE_BLOCK_CAP_PER_RUN per run. In
 *                 notify_only this is counted as `wouldBlock` and NOTHING is
 *                 written: notify_only never sets blocked_at.
 *   4. Recover  — standing not ok and nothing overdue (or nothing owed)
 *                 → reevaluate_tenant_fee_standing() clears it (the same SQL
 *                 the pay-now settle path calls).
 *
 * The balance is re-derived every run from transactions + payments (D4);
 * stamps only control emails, so a bad statement row can never block a school
 * whose live balance is paid. Email failures are swallowed and counted; a
 * failed send leaves its stamp unset so the next run retries.
 *
 * `enforcement_mode = 'off'` makes the whole run a no-op (kill switch).
 * `dryRun` computes the would-act set and writes/sends nothing.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MONEY_EPSILON, roundMoney } from '@/lib/payments/payouts-owed'
import {
  computeFeeBalances,
  FEE_DUE_DAYS,
  FEE_LEDGER_PROVIDERS,
  feeForTxn,
  overdueFeeBalances,
  type FeeLedgerOptions,
  type FeeLedgerTxn,
  type FeePayment,
} from '@/lib/payments/platform-fee-owed'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { formatCurrency } from '@/lib/currency'
import {
  platformFeeNoticeTemplate,
  type PlatformFeeNoticeKind,
} from '@/lib/email/templates/platform-fee-notice'

/** Hard cap on tenants newly blocked in one run (design 3, "Safety rails"). */
export const FEE_BLOCK_CAP_PER_RUN = 25

/**
 * Never blocked by this job (design 3): the platform's own default school
 * cannot owe the platform. Statements and notices still run for it.
 */
export const FEE_BLOCK_EXEMPT_TENANT_IDS: readonly string[] = ['00000000-0000-0000-0000-000000000001']

const DAY_MS = 24 * 60 * 60 * 1000

export type EnforcementMode = 'off' | 'notify_only' | 'enforce'
export type StandingState = 'ok' | 'reminded' | 'overdue' | 'blocked'

export interface FeeConfig {
  enforcementMode: EnforcementMode
  feeGraceDays: number
  minBlockingBalance: number
  hyperinflationCurrencies: string[]
}

export interface FeeTenant {
  id: string
  name: string | null
  slug: string | null
}

export interface FeeTxnRow extends FeeLedgerTxn {
  fxRateToUsd?: number | null
  fxRateSource?: string | null
}

export interface FeeStanding {
  tenantId: string
  state: StandingState
  overdueSince: string | null
  blockedAt: string | null
}

export interface FeeStatement {
  statementId: string
  tenantId: string
  currency: string
  periodStart: string
  periodEnd: string
  feeAmount: number
  statementNumber: string
  dueAt: string
  issuedEmailSentAt: string | null
  reminderSentAt: string | null
  overdueEmailSentAt: string | null
}

export interface NewStatement {
  tenantId: string
  currency: string
  periodStart: string
  periodEnd: string
  feeAmount: number
  txnCount: number
  lines: Record<string, unknown>
  dueAt: string
  /** YYYYMM; the store allocates PF-YYYYMM-<seq>. */
  yyyymm: string
}

export type StatementStamp = 'issued_email_sent_at' | 'reminder_sent_at' | 'overdue_email_sent_at'

/** Everything the phases read and write. Real impl: createSupabaseFeeStore(). */
export interface FeeStore {
  getConfig(): Promise<FeeConfig>
  listTenants(): Promise<FeeTenant[]>
  getLedger(tenantId: string): Promise<{
    txns: FeeTxnRow[]
    payments: FeePayment[]
    fallbackSchoolPercentage: number | null
  }>
  getStanding(tenantId: string): Promise<FeeStanding | null>
  /** Statements with period_start >= sinceDate (YYYY-MM-DD). */
  listStatements(tenantId: string, sinceDate: string): Promise<FeeStatement[]>
  /** Idempotent: returns null when the (tenant, currency, period) statement already exists. */
  insertStatement(row: NewStatement): Promise<FeeStatement | null>
  stampStatement(statementId: string, column: StatementStamp, at: string): Promise<void>
  /**
   * Status-gated write: `from = null` inserts a new row (false if one appeared
   * meanwhile); otherwise updates only while `state = from`.
   */
  transitionStanding(
    tenantId: string,
    from: StandingState | null,
    patch: { state: StandingState; overdue_since?: string | null; blocked_at?: string | null; last_evaluated_at: string },
  ): Promise<boolean>
  /** reevaluate_tenant_fee_standing(): only ever recovers; returns the new state. */
  reevaluate(tenantId: string): Promise<string>
  adminEmails(tenantId: string): Promise<string[]>
  locale(tenantId: string): Promise<'en' | 'es'>
}

export interface EnforcementOptions {
  now?: Date
  dryRun?: boolean
  sendEmail: (opts: { to: string; subject: string; html: string }) => Promise<boolean>
  /** Base URL builder for the admin link (tenant subdomain). */
  tenantUrl: (slug: string | null) => string
  blockCap?: number
}

export interface EnforcementAction {
  tenantId: string
  action: 'close_statement' | 'remind' | 'overdue' | 'block' | 'would_block' | 'recover'
  currency?: string
  amount?: number
}

export interface EnforcementResult {
  mode: EnforcementMode
  dryRun: boolean
  skipped: boolean
  tenantsScanned: number
  statementsClosed: number
  statementEmails: number
  reminded: number
  overdue: number
  blocked: number
  /** notify_only: tenants that WOULD have been blocked in enforce. */
  wouldBlock: number
  blockCapReached: boolean
  unblocked: number
  recovered: number
  emailFailures: number
  errors: number
  actions?: EnforcementAction[]
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function dueLabel(iso: string, locale: 'en' | 'es'): string {
  const d = new Date(iso)
  return `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(d)} (UTC)`
}

function amountLabel(amounts: { currency: string; amount: number }[], locale: 'en' | 'es'): string {
  return amounts.map((a) => formatCurrency(a.amount, a.currency.toLowerCase(), locale)).join(' + ')
}

/** Close-of-month lines (2.3): per source currency, plus FX used for converted sales. */
function statementLines(rows: FeeTxnRow[], opts: FeeLedgerOptions, ledgerCurrency: string) {
  const sources: Record<
    string,
    { sales_total: number; sales_count: number; fee: number; converted: boolean; usd_subtotal?: number; rates?: { rate: number; source: string | null }[] }
  > = {}
  let fee = 0
  let count = 0
  for (const t of rows) {
    const line = feeForTxn(t, opts)
    if (!line || line.ledgerCurrency !== ledgerCurrency) continue
    const s = (sources[line.sourceCurrency] ??= { sales_total: 0, sales_count: 0, fee: 0, converted: line.converted })
    s.sales_total = roundMoney(s.sales_total + line.kept)
    s.sales_count++
    s.fee = roundMoney(s.fee + line.fee)
    if (line.converted) {
      s.usd_subtotal = roundMoney((s.usd_subtotal ?? 0) + line.base)
      const rate = { rate: Number(t.fxRateToUsd ?? 0), source: t.fxRateSource ?? null }
      s.rates ??= []
      if (!s.rates.some((r) => r.rate === rate.rate && r.source === rate.source)) s.rates.push(rate)
    }
    fee = roundMoney(fee + line.fee)
    count++
  }
  return { sources, fee, count }
}

/**
 * Fail-safe reading of the route's `?dryRun` param: ANY present value other
 * than an explicit `0`/`false` (case-insensitive, trimmed) is a dry run, so
 * `?dryRun`, `?dryRun=TRUE` or `?dryRun=yes` can never write, email or block.
 * Absent param → real run.
 */
export function parseDryRunParam(params: URLSearchParams): boolean {
  if (!params.has('dryRun')) return false
  const v = (params.get('dryRun') ?? '').trim().toLowerCase()
  return v !== '0' && v !== 'false'
}

export async function runPlatformFeeEnforcement(store: FeeStore, opts: EnforcementOptions): Promise<EnforcementResult> {
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const dryRun = !!opts.dryRun
  const cap = opts.blockCap ?? FEE_BLOCK_CAP_PER_RUN
  const config = await store.getConfig()

  const result: EnforcementResult = {
    mode: config.enforcementMode,
    dryRun,
    skipped: false,
    tenantsScanned: 0,
    statementsClosed: 0,
    statementEmails: 0,
    reminded: 0,
    overdue: 0,
    blocked: 0,
    wouldBlock: 0,
    blockCapReached: false,
    unblocked: 0,
    recovered: 0,
    emailFailures: 0,
    errors: 0,
    ...(dryRun ? { actions: [] as EnforcementAction[] } : {}),
  }
  const act = (a: EnforcementAction) => result.actions?.push(a)

  if (config.enforcementMode === 'off') {
    result.skipped = true
    return result
  }

  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const curMonthStart = Date.UTC(y, m, 1)
  const prevMonthStart = Date.UTC(y, m - 1, 1)
  const prevPeriodStart = ymd(prevMonthStart)
  const prevPeriodEnd = ymd(curMonthStart - DAY_MS)
  const prevDueAt = new Date(Date.UTC(y, m, 1 + FEE_DUE_DAYS)).toISOString()
  const prevYyyymm = prevPeriodStart.slice(0, 7).replace('-', '')
  // Statements old enough to still matter for reminders / overdue stamps.
  const statementsSince = ymd(Date.UTC(y, m - 3, 1))

  const tenants = await store.listTenants()

  for (const tenant of tenants) {
    try {
      const [{ txns, payments, fallbackSchoolPercentage }, standingRow] = await Promise.all([
        store.getLedger(tenant.id),
        store.getStanding(tenant.id),
      ])
      if (txns.length === 0 && payments.length === 0 && !standingRow) continue
      result.tenantsScanned++

      const ledgerOpts: FeeLedgerOptions = {
        fallbackSchoolPercentage: fallbackSchoolPercentage ?? undefined,
        hyperinflationCurrencies: config.hyperinflationCurrencies,
      }
      const balances = computeFeeBalances(txns, payments, ledgerOpts)
      const owedBy = new Map(balances.map((b) => [b.currency, b.netOwed]))
      const owesAnything = balances.some((b) => b.netOwed > MONEY_EPSILON)
      const overdue = overdueFeeBalances(txns, payments, now, ledgerOpts)

      let standing: StandingState | null = standingRow?.state ?? null
      let overdueSince = standingRow?.overdueSince ?? null

      let localeCache: 'en' | 'es' | null = null
      let emailsCache: string[] | null = null
      const notify = async (
        kind: PlatformFeeNoticeKind,
        amounts: { currency: string; amount: number }[],
        due: string | null,
        statementNumber?: string,
      ): Promise<boolean> => {
        try {
          localeCache ??= await store.locale(tenant.id)
          emailsCache ??= await store.adminEmails(tenant.id)
        } catch (err) {
          console.error('enforce-platform-fees: recipient lookup failed', tenant.id, err instanceof Error ? err.message : err)
          result.emailFailures++
          return false
        }
        if (emailsCache.length === 0) return false
        const template = platformFeeNoticeTemplate({
          kind,
          schoolName: tenant.name || 'your school',
          amountLabel: amountLabel(amounts, localeCache),
          dueLabel: due ? dueLabel(due, localeCache) : null,
          billingUrl: `${opts.tenantUrl(tenant.slug)}/${localeCache}/dashboard/admin/earnings`,
          locale: localeCache,
          statementNumber,
        })
        let allSent = true
        for (const to of emailsCache) {
          try {
            if (!(await opts.sendEmail({ to, ...template }))) allSent = false
          } catch (err) {
            console.error('enforce-platform-fees: email send failed', tenant.id, err instanceof Error ? err.message : err)
            allSent = false
          }
        }
        if (!allSent) result.emailFailures++
        return allSent
      }

      // ── 0. Close last month ──
      let statements = await store.listStatements(tenant.id, statementsSince)
      const prevRows = txns.filter((t) => {
        const at = Date.parse(t.transactionDate)
        return at >= prevMonthStart && at < curMonthStart
      })
      const atClose = computeFeeBalances(txns, payments, { ...ledgerOpts, accruedBefore: curMonthStart })
      for (const bucket of atClose) {
        if (bucket.netOwed <= MONEY_EPSILON) continue // paid ahead: nothing to state
        if (statements.some((s) => s.currency === bucket.currency && s.periodStart === prevPeriodStart)) continue
        const lines = statementLines(prevRows, ledgerOpts, bucket.currency)
        if (lines.fee <= MONEY_EPSILON) continue // nothing accrued last month in this bucket
        act({ tenantId: tenant.id, action: 'close_statement', currency: bucket.currency, amount: lines.fee })
        if (dryRun) {
          result.statementsClosed++
          continue
        }
        const created = await store.insertStatement({
          tenantId: tenant.id,
          currency: bucket.currency,
          periodStart: prevPeriodStart,
          periodEnd: prevPeriodEnd,
          feeAmount: lines.fee,
          txnCount: lines.count,
          lines: {
            sources: lines.sources,
            payments_total: bucket.paid,
            closing_balance: bucket.netOwed,
          },
          dueAt: prevDueAt,
          yyyymm: prevYyyymm,
        })
        if (created) {
          result.statementsClosed++
          statements = [...statements, created]
        }
      }

      if (!dryRun) {
        for (const s of statements) {
          if (s.periodStart !== prevPeriodStart || s.issuedEmailSentAt) continue
          if (await notify('statement', [{ currency: s.currency, amount: s.feeAmount }], s.dueAt, s.statementNumber)) {
            await store.stampStatement(s.statementId, 'issued_email_sent_at', nowIso)
            s.issuedEmailSentAt = nowIso
            result.statementEmails++
          }
        }
      }

      // ── 1. Reminder (due tomorrow) ──
      const dueSoon = statements.filter((s) => {
        const due = Date.parse(s.dueAt)
        return !s.reminderSentAt && now.getTime() >= due - DAY_MS && now.getTime() < due && (owedBy.get(s.currency) ?? 0) > MONEY_EPSILON
      })
      if (dueSoon.length > 0) {
        act({ tenantId: tenant.id, action: 'remind' })
        result.reminded++
        if (!dryRun) {
          const amounts = dueSoon.map((s) => ({ currency: s.currency, amount: owedBy.get(s.currency) ?? 0 }))
          if (await notify('reminder', amounts, dueSoon[0].dueAt)) {
            for (const s of dueSoon) await store.stampStatement(s.statementId, 'reminder_sent_at', nowIso)
          }
          if (standing === null || standing === 'ok') {
            if (await store.transitionStanding(tenant.id, standing, { state: 'reminded', last_evaluated_at: nowIso })) {
              standing = 'reminded'
            }
          }
        }
      }

      // ── 2. Overdue (stateless, D4) ──
      if (overdue.length > 0) {
        const overdueCurrencies = new Set(overdue.map((o) => o.currency))
        const unstamped = statements.filter(
          (s) => overdueCurrencies.has(s.currency) && Date.parse(s.dueAt) < now.getTime() && !s.overdueEmailSentAt,
        )
        let transitioned = false
        if (standing === null || standing === 'ok' || standing === 'reminded') {
          act({ tenantId: tenant.id, action: 'overdue' })
          result.overdue++
          if (!dryRun && (await store.transitionStanding(tenant.id, standing, {
            state: 'overdue',
            overdue_since: nowIso,
            blocked_at: null,
            last_evaluated_at: nowIso,
          }))) {
            standing = 'overdue'
            overdueSince = nowIso
            transitioned = true
          }
        }
        if (!dryRun && (transitioned || unstamped.length > 0)) {
          const sent = await notify(
            'overdue',
            overdue.map((o) => ({ currency: o.currency, amount: o.overdue })),
            overdue[0].dueAt.toISOString(),
          )
          if (sent) for (const s of unstamped) await store.stampStatement(s.statementId, 'overdue_email_sent_at', nowIso)
        }
      }

      // ── 3. Block (enforce only) ──
      if (overdue.length > 0 && standing === 'overdue' && overdueSince) {
        const graceOver = now.getTime() > Date.parse(overdueSince) + config.feeGraceDays * DAY_MS
        const overThreshold = overdue.some((o) => o.overdue >= config.minBlockingBalance)
        const exempt = FEE_BLOCK_EXEMPT_TENANT_IDS.includes(tenant.id)
        if (graceOver && overThreshold && !exempt) {
          if (config.enforcementMode !== 'enforce') {
            // notify_only: report, never write blocked_at.
            act({ tenantId: tenant.id, action: 'would_block' })
            result.wouldBlock++
          } else if (result.blocked >= cap) {
            if (!result.blockCapReached) {
              console.error(`enforce-platform-fees: block cap (${cap}) reached; remaining tenants wait for the next run`)
            }
            result.blockCapReached = true
          } else {
            act({ tenantId: tenant.id, action: 'block' })
            if (dryRun) {
              result.blocked++
            } else if (await store.transitionStanding(tenant.id, 'overdue', {
              state: 'blocked',
              overdue_since: overdueSince,
              blocked_at: nowIso,
              last_evaluated_at: nowIso,
            })) {
              standing = 'blocked'
              result.blocked++
              await notify('blocked', overdue.map((o) => ({ currency: o.currency, amount: o.overdue })), null)
            }
          }
        }
      }

      // ── 4. Recover ──
      if (standing !== null && standing !== 'ok') {
        const recover = !owesAnything || (overdue.length === 0 && (standing === 'overdue' || standing === 'blocked'))
        if (recover) {
          act({ tenantId: tenant.id, action: 'recover' })
          if (dryRun) {
            result.recovered++
            if (standing === 'blocked') result.unblocked++
          } else {
            const next = await store.reevaluate(tenant.id)
            if (next === 'ok') {
              result.recovered++
              if (standing === 'blocked') {
                result.unblocked++
                await notify('resumed', [], null)
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('enforce-platform-fees: tenant failed', tenant.id, err instanceof Error ? err.message : err)
      result.errors++
    }
  }

  return result
}

// ─── Supabase-backed store ──────────────────────────────────────────────────

type StatementRow = {
  statement_id: string
  tenant_id: string
  currency: string
  period_start: string
  period_end: string
  fee_amount: number | string
  statement_number: string
  due_at: string
  issued_email_sent_at: string | null
  reminder_sent_at: string | null
  overdue_email_sent_at: string | null
}

const STATEMENT_COLS =
  'statement_id, tenant_id, currency, period_start, period_end, fee_amount, statement_number, due_at, issued_email_sent_at, reminder_sent_at, overdue_email_sent_at'

function toStatement(r: StatementRow): FeeStatement {
  return {
    statementId: r.statement_id,
    tenantId: r.tenant_id,
    currency: r.currency,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    feeAmount: Number(r.fee_amount),
    statementNumber: r.statement_number,
    dueAt: r.due_at,
    issuedEmailSentAt: r.issued_email_sent_at,
    reminderSentAt: r.reminder_sent_at,
    overdueEmailSentAt: r.overdue_email_sent_at,
  }
}

const VALID_MODES: readonly EnforcementMode[] = ['off', 'notify_only', 'enforce']

export function createSupabaseFeeStore(
  admin: SupabaseClient,
  deps: {
    adminEmails: (sb: SupabaseClient, tenantId: string) => Promise<string[]>
    locale: (sb: SupabaseClient, tenantId: string) => Promise<'en' | 'es'>
  },
): FeeStore {
  return {
    async getConfig() {
      const { data, error } = await admin
        .from('platform_fee_config')
        .select('enforcement_mode, fee_grace_days, min_blocking_balance, hyperinflation_currencies')
        .eq('id', true)
        .maybeSingle()
      // A kill switch that cannot be read must not be guessed: fail the run.
      if (error) throw new Error(`platform_fee_config read failed: ${error.message}`)
      const mode = (data?.enforcement_mode ?? 'notify_only') as EnforcementMode
      return {
        enforcementMode: VALID_MODES.includes(mode) ? mode : 'notify_only',
        feeGraceDays: Number(data?.fee_grace_days ?? 7),
        minBlockingBalance: Number(data?.min_blocking_balance ?? 1),
        hyperinflationCurrencies: (data?.hyperinflation_currencies as string[] | null) ?? ['VES'],
      }
    },

    async listTenants() {
      const rows = await fetchAllRows<{ id: string; name: string | null; slug: string | null }>('tenants', (from, to) =>
        admin.from('tenants').select('id, name, slug', { count: 'exact' }).order('id').range(from, to),
      )
      return rows
    },

    async getLedger(tenantId) {
      type TxnRow = {
        payment_provider: string
        amount: number | string
        refunded_amount: number | string | null
        currency: string | null
        school_percentage_snapshot: number | string | null
        status: string
        transaction_date: string
        usd_amount: number | string | null
        fx_rate_to_usd: number | string | null
        fx_rate_source: string | null
      }
      const [rows, paymentsRes, splitRes] = await Promise.all([
        fetchAllRows<TxnRow>('transactions', (from, to) =>
          admin
            .from('transactions')
            .select(
              'transaction_id, payment_provider, amount, refunded_amount, currency, school_percentage_snapshot, status, transaction_date, usd_amount, fx_rate_to_usd, fx_rate_source',
              { count: 'exact' },
            )
            .eq('tenant_id', tenantId)
            .in('payment_provider', FEE_LEDGER_PROVIDERS as string[])
            .eq('status', 'successful')
            .gt('amount', 0)
            .order('transaction_id')
            .range(from, to),
        ),
        admin
          .from('platform_fee_payments')
          .select('amount, currency, status')
          .eq('tenant_id', tenantId)
          .eq('status', 'succeeded'),
        admin.from('revenue_splits').select('school_percentage').eq('tenant_id', tenantId).maybeSingle(),
      ])
      if (paymentsRes.error) throw new Error(`platform_fee_payments read failed: ${paymentsRes.error.message}`)
      const num = (v: number | string | null) => (v === null ? null : Number(v))
      return {
        txns: rows.map((r) => ({
          paymentProvider: r.payment_provider,
          amount: Number(r.amount),
          refundedAmount: num(r.refunded_amount),
          currency: r.currency,
          schoolPercentageSnapshot: num(r.school_percentage_snapshot),
          status: r.status,
          transactionDate: r.transaction_date,
          usdAmount: num(r.usd_amount),
          fxRateToUsd: num(r.fx_rate_to_usd),
          fxRateSource: r.fx_rate_source,
        })),
        payments: (paymentsRes.data ?? []).map((p) => ({
          amount: Number(p.amount),
          currency: String(p.currency),
          status: String(p.status),
        })),
        fallbackSchoolPercentage:
          splitRes.data?.school_percentage != null ? Number(splitRes.data.school_percentage) : null,
      }
    },

    async getStanding(tenantId) {
      const { data, error } = await admin
        .from('tenant_fee_standing')
        .select('tenant_id, state, overdue_since, blocked_at')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) throw new Error(`tenant_fee_standing read failed: ${error.message}`)
      if (!data) return null
      return {
        tenantId: data.tenant_id,
        state: data.state as StandingState,
        overdueSince: data.overdue_since,
        blockedAt: data.blocked_at,
      }
    },

    async listStatements(tenantId, sinceDate) {
      const { data, error } = await admin
        .from('platform_fee_statements')
        .select(STATEMENT_COLS)
        .eq('tenant_id', tenantId)
        .gte('period_start', sinceDate)
        .order('period_start')
      if (error) throw new Error(`platform_fee_statements read failed: ${error.message}`)
      return ((data ?? []) as StatementRow[]).map(toStatement)
    },

    async insertStatement(row) {
      // PF-YYYYMM-<seq>: an internal reference, not a fiscal number. The seq is
      // count + 1 with a retry on a collision; the (tenant, currency, period)
      // unique key is what makes the close idempotent.
      for (let attempt = 0; attempt < 5; attempt++) {
        const { count } = await admin
          .from('platform_fee_statements')
          .select('statement_id', { count: 'exact', head: true })
          .like('statement_number', `PF-${row.yyyymm}-%`)
        const statementNumber = `PF-${row.yyyymm}-${(count ?? 0) + 1 + attempt}`
        const { data, error } = await admin
          .from('platform_fee_statements')
          .insert({
            tenant_id: row.tenantId,
            currency: row.currency,
            period_start: row.periodStart,
            period_end: row.periodEnd,
            fee_amount: row.feeAmount,
            txn_count: row.txnCount,
            lines: row.lines,
            statement_number: statementNumber,
            due_at: row.dueAt,
          })
          .select(STATEMENT_COLS)
          .single()
        if (!error && data) return toStatement(data as StatementRow)
        if (error?.code !== '23505') throw new Error(`statement insert failed: ${error?.message}`)
        // Unique violation: either this period already exists (idempotent) or
        // the number collided with a concurrent run (retry with the next).
        const { data: existing } = await admin
          .from('platform_fee_statements')
          .select('statement_id')
          .eq('tenant_id', row.tenantId)
          .eq('currency', row.currency)
          .eq('period_start', row.periodStart)
          .maybeSingle()
        if (existing) return null
      }
      throw new Error('statement insert failed: could not allocate a statement number')
    },

    async stampStatement(statementId, column, at) {
      const { error } = await admin
        .from('platform_fee_statements')
        .update({ [column]: at })
        .eq('statement_id', statementId)
        .is(column, null)
      if (error) throw new Error(`statement stamp failed: ${error.message}`)
    },

    async transitionStanding(tenantId, from, patch) {
      if (from === null) {
        const { error } = await admin
          .from('tenant_fee_standing')
          .insert({ tenant_id: tenantId, ...patch, updated_at: patch.last_evaluated_at })
        if (!error) return true
        if (error.code === '23505') return false
        throw new Error(`standing insert failed: ${error.message}`)
      }
      const { data, error } = await admin
        .from('tenant_fee_standing')
        .update({ ...patch, updated_at: patch.last_evaluated_at })
        .eq('tenant_id', tenantId)
        .eq('state', from)
        .select('tenant_id')
      if (error) throw new Error(`standing update failed: ${error.message}`)
      return (data ?? []).length > 0
    },

    async reevaluate(tenantId) {
      const { data, error } = await admin.rpc('reevaluate_tenant_fee_standing', { _tenant_id: tenantId })
      if (error) throw new Error(`reevaluate_tenant_fee_standing failed: ${error.message}`)
      return String(data)
    },

    adminEmails: (tenantId) => deps.adminEmails(admin, tenantId),
    locale: (tenantId) => deps.locale(admin, tenantId),
  }
}
