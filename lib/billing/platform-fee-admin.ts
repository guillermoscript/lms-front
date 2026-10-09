/**
 * Super-admin platform fee ledger tools (#929, design 4.4): confirm a manual
 * fee payment, record an offline payment, waive or adjust with a reason, set a
 * tenant's enforcement exemption, view standing. Server-only.
 *
 * Every write is one SECURITY DEFINER SQL function (migration 20261009130000)
 * that re-checks `super_admins` for the actor, writes the ledger append-only,
 * appends `platform_fee_audit_log` and re-evaluates standing — all in one
 * transaction. Callers (server actions) must still verify `isSuperAdmin()` and
 * pass the verified user id as `actorId`; never a client-supplied id.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeeBalance } from '@/lib/payments/platform-fee-owed'
import { getTenantFeeBalances } from '@/lib/billing/platform-fee-paynow'

export class FeeLedgerActionError extends Error {
  constructor(
    message: string,
    readonly code: 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'internal',
  ) {
    super(message)
    this.name = 'FeeLedgerActionError'
  }
}

function mapRpcError(error: { code?: string; message?: string }): FeeLedgerActionError {
  const message = error.message || 'Platform fee ledger action failed'
  switch (error.code) {
    case '42501':
      return new FeeLedgerActionError('Only super admins can change the platform fee ledger', 'forbidden')
    case 'P0002':
      return new FeeLedgerActionError(message, 'not_found')
    case '22023':
    case '23514':
      return new FeeLedgerActionError(message, 'invalid')
    case 'P0001':
      return new FeeLedgerActionError(message, 'conflict')
    default:
      return new FeeLedgerActionError(message, 'internal')
  }
}

export interface ConfirmFeeRequestResult {
  applied: boolean
  tenantId: string
  paymentId: string
  /** Standing after re-evaluation; null on a replay. */
  standing: string | null
}

/** Confirm a manual fee request (money received). Replay-safe: a second call returns `applied: false`. */
export async function confirmFeeRequest(
  admin: SupabaseClient,
  requestId: string,
  actorId: string,
): Promise<ConfirmFeeRequestResult> {
  const { data, error } = await admin.rpc('confirm_platform_fee_request', {
    _request_id: requestId,
    _confirmed_by: actorId,
  })
  if (error) throw mapRpcError(error)
  const row = (Array.isArray(data) ? data[0] : data) as
    | { applied: boolean; tenant_id: string; payment_id: string; standing: string | null }
    | undefined
  if (!row) throw new FeeLedgerActionError('Failed to confirm the fee payment', 'internal')
  return { applied: row.applied, tenantId: row.tenant_id, paymentId: row.payment_id, standing: row.standing }
}

export interface RecordFeePaymentInput {
  tenantId: string
  /** Ledger currency, upper-case ISO (USD for converted hyperinflation sales). */
  currency: string
  /** Major units, > 0, at most 2 decimals. */
  amount: number
  /** `offline` = money received outside the platform; `waiver` = credit written off. */
  kind: 'offline' | 'waiver'
  reason: string
  reference?: string | null
}

/** Record an offline payment or a waiver (append-only credit). Returns the payment id. */
export async function recordFeePayment(
  admin: SupabaseClient,
  input: RecordFeePaymentInput,
  actorId: string,
): Promise<string> {
  const { data, error } = await admin.rpc('record_platform_fee_payment', {
    _tenant_id: input.tenantId,
    _currency: input.currency.toUpperCase(),
    _amount: input.amount,
    _kind: input.kind,
    _actor: actorId,
    _reason: input.reason,
    _reference: input.reference ?? null,
  })
  if (error) throw mapRpcError(error)
  return String(data)
}

/** Adjust down: reverse one credited payment (bounced transfer, mistaken entry). */
export async function reverseFeePayment(
  admin: SupabaseClient,
  paymentId: string,
  reason: string,
  actorId: string,
): Promise<'reversed' | 'duplicate' | 'not_settled' | 'not_found'> {
  const { data, error } = await admin.rpc('admin_reverse_platform_fee_payment', {
    _payment_id: paymentId,
    _actor: actorId,
    _reason: reason,
  })
  if (error) throw mapRpcError(error)
  return String(data) as 'reversed' | 'duplicate' | 'not_settled' | 'not_found'
}

/** Exempt (or stop exempting) a tenant from the sales block. Exempting lifts an active block. */
export async function setFeeExemption(
  admin: SupabaseClient,
  tenantId: string,
  exempt: boolean,
  reason: string,
  actorId: string,
): Promise<void> {
  const { error } = await admin.rpc('set_tenant_fee_exemption', {
    _tenant_id: tenantId,
    _exempt: exempt,
    _actor: actorId,
    _reason: reason,
  })
  if (error) throw mapRpcError(error)
}

export interface TenantFeeOverview {
  tenantId: string
  standing: {
    state: 'ok' | 'reminded' | 'overdue' | 'blocked'
    overdueSince: string | null
    blockedAt: string | null
    enforcementExempt: boolean
    exemptReason: string | null
    lastEvaluatedAt: string | null
  }
  /** Per currency, never summed across currencies. */
  balances: FeeBalance[]
  payments: {
    paymentId: string
    currency: string
    amount: number
    provider: string
    status: string
    paidAt: string | null
    createdAt: string
    reviewReason: string | null
    reversalReason: string | null
    notes: string | null
  }[]
  openRequests: { requestId: string; amount: number; currency: string; status: string; createdAt: string; expiresAt: string | null }[]
  audit: { action: string; actorId: string | null; amount: number | null; currency: string | null; reason: string | null; createdAt: string }[]
}

/** Everything the super-admin fee panel shows for one tenant (admin client; caller verifies super admin). */
export async function getTenantFeeOverview(admin: SupabaseClient, tenantId: string): Promise<TenantFeeOverview> {
  const [balances, standingRes, paymentsRes, requestsRes, auditRes] = await Promise.all([
    getTenantFeeBalances(admin, tenantId),
    admin
      .from('tenant_fee_standing')
      .select('state, overdue_since, blocked_at, enforcement_exempt, exempt_reason, last_evaluated_at')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin
      .from('platform_fee_payments')
      .select('payment_id, currency, amount, provider, status, paid_at, created_at, review_reason, reversal_reason, notes')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('platform_payment_requests')
      .select('request_id, amount, currency, status, created_at, expires_at')
      .eq('tenant_id', tenantId)
      .eq('request_type', 'fee')
      .in('status', ['pending', 'instructions_sent', 'payment_received'])
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('platform_fee_audit_log')
      .select('action, actor_id, amount, currency, reason, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  for (const r of [standingRes, paymentsRes, requestsRes, auditRes]) {
    if (r.error) throw new FeeLedgerActionError(r.error.message, 'internal')
  }
  const s = standingRes.data
  return {
    tenantId,
    standing: {
      state: (s?.state as TenantFeeOverview['standing']['state']) ?? 'ok',
      overdueSince: s?.overdue_since ?? null,
      blockedAt: s?.blocked_at ?? null,
      enforcementExempt: s?.enforcement_exempt === true,
      exemptReason: s?.exempt_reason ?? null,
      lastEvaluatedAt: s?.last_evaluated_at ?? null,
    },
    balances,
    payments: (paymentsRes.data ?? []).map((p) => ({
      paymentId: p.payment_id,
      currency: p.currency,
      amount: Number(p.amount),
      provider: p.provider,
      status: p.status,
      paidAt: p.paid_at,
      createdAt: p.created_at,
      reviewReason: p.review_reason,
      reversalReason: p.reversal_reason,
      notes: p.notes,
    })),
    openRequests: (requestsRes.data ?? []).map((r) => ({
      requestId: r.request_id,
      amount: Number(r.amount),
      currency: String(r.currency).toUpperCase(),
      status: r.status,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    })),
    audit: (auditRes.data ?? []).map((a) => ({
      action: a.action,
      actorId: a.actor_id,
      amount: a.amount === null ? null : Number(a.amount),
      currency: a.currency,
      reason: a.reason,
      createdAt: a.created_at,
    })),
  }
}
