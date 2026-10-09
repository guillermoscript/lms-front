/**
 * Platform bank accounts (#929): where schools wire platform-fee transfers.
 * Managed by super admins in /platform/bank-accounts (table
 * `platform_bank_accounts`, migration 20261009140000).
 *
 * SERVER ONLY. The loaders use the service-role client, so callers must have
 * verified the viewer first (an active admin of the school that owes the fee,
 * or a super admin). Nothing here logs an account number. Client code may
 * import TYPES from this module, never values; form validation lives in
 * `platform-bank-account-input.ts`.
 */
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRequestOpen, OPEN_REQUEST_STATUSES } from '@/lib/billing/payment-request-ttl'

/** One receiving account, as the pay-now dialog renders it. */
export type PlatformBankAccountView = {
  id: string
  currency: string
  label: string
  bankName: string
  accountHolder: string
  accountNumber: string
  accountType: string | null
  /** Routing/branch number and SWIFT/BIC, joined with " / " when both are set. */
  routingOrSwift: string | null
  extraInstructions: string | null
}

/** Super-admin row: every column the management page shows or edits. */
export interface PlatformBankAccount {
  id: string
  currency: string
  label: string
  bankName: string
  accountHolder: string
  accountNumber: string
  accountType: string | null
  routingNumber: string | null
  swiftCode: string | null
  extraInstructions: string | null
  isActive: boolean
  sortOrder: number
  updatedAt: string
}

/** A platform-fee transfer still waiting for confirmation. */
export type OpenFeeRequestView = { id: string; amount: number; currency: string; requestedAt: string }

const COLUMNS =
  'id, currency, label, bank_name, account_holder, account_number, account_type, routing_number, swift_code, extra_instructions, is_active, sort_order, updated_at'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)

function toAccount(r: Row): PlatformBankAccount {
  return {
    id: String(r.id),
    currency: String(r.currency),
    label: String(r.label),
    bankName: String(r.bank_name),
    accountHolder: String(r.account_holder),
    accountNumber: String(r.account_number),
    accountType: str(r.account_type),
    routingNumber: str(r.routing_number),
    swiftCode: str(r.swift_code),
    extraInstructions: str(r.extra_instructions),
    isActive: r.is_active === true,
    sortOrder: Number(r.sort_order ?? 0),
    updatedAt: String(r.updated_at),
  }
}

/** Only the fields the school-facing dialog renders. Pure. */
export function toBankAccountView(a: PlatformBankAccount): PlatformBankAccountView {
  const routingOrSwift = [a.routingNumber, a.swiftCode].filter(Boolean).join(' / ')
  return {
    id: a.id,
    currency: a.currency,
    label: a.label,
    bankName: a.bankName,
    accountHolder: a.accountHolder,
    accountNumber: a.accountNumber,
    accountType: a.accountType,
    routingOrSwift: routingOrSwift || null,
    extraInstructions: a.extraInstructions,
  }
}

/**
 * The accounts a school may pay a `currency` balance into: the active
 * account(s) in that currency, else the active USD account(s), else none.
 * Pure; `active` must already be active-only and ordered.
 */
export function selectBankAccountsFor<T extends { currency: string }>(active: readonly T[], currency: string): T[] {
  const want = currency.trim().toUpperCase()
  const exact = active.filter((a) => a.currency === want)
  return exact.length > 0 ? exact : active.filter((a) => a.currency === 'USD')
}

/** Union of `selectBankAccountsFor` over several currencies, de-duplicated by id, order kept. Pure. */
export function selectBankAccountsForAll<T extends { id: string; currency: string }>(
  active: readonly T[],
  currencies: readonly string[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const c of currencies) {
    for (const a of selectBankAccountsFor(active, c)) {
      if (!seen.has(a.id)) {
        seen.add(a.id)
        out.push(a)
      }
    }
  }
  return out
}

/** Every account (active first) for the super-admin page. Throws on read failure. */
export async function listAllBankAccounts(admin: SupabaseClient): Promise<PlatformBankAccount[]> {
  const { data, error } = await admin
    .from('platform_bank_accounts')
    .select(COLUMNS)
    .order('is_active', { ascending: false })
    .order('currency', { ascending: true })
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`platform_bank_accounts read failed: ${error.code ?? ''}`)
  return ((data ?? []) as Row[]).map(toAccount)
}

/** Active accounts, ordered, mapped to the dialog view. Throws on read failure (code only, never row data). */
export async function fetchActiveBankAccounts(admin: SupabaseClient): Promise<PlatformBankAccountView[]> {
  const { data, error } = await admin
    .from('platform_bank_accounts')
    .select(COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`platform_bank_accounts read failed: ${error.code ?? ''}`)
  return ((data ?? []) as Row[]).map((r) => toBankAccountView(toAccount(r)))
}

/** All active accounts, deduplicated per request. */
export const loadActiveBankAccounts = cache(() => fetchActiveBankAccounts(createAdminClient()))

/** Active accounts for a balance currency (USD fallback), deduplicated per request. */
export const loadActiveBankAccountsFor = cache(async (currency: string) =>
  selectBankAccountsFor(await loadActiveBankAccounts(), currency),
)

/** Whether any active account exists (super-admin warning). Null when it can't be read, never a false "none". */
export const hasActiveBankAccount = cache(async (): Promise<boolean | null> => {
  const { count, error } = await createAdminClient()
    .from('platform_bank_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
  if (error) return null
  return (count ?? 0) > 0
})

/**
 * The tenant's platform-fee transfer still waiting for confirmation, judged
 * exactly like the checkout route's 409 `fee_request_open` (expired = not open).
 */
export async function fetchOpenFeeRequest(
  admin: SupabaseClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<OpenFeeRequestView | null> {
  const { data, error } = await admin
    .from('platform_payment_requests')
    .select('request_id, amount, currency, status, created_at, expires_at')
    .eq('tenant_id', tenantId)
    .eq('request_type', 'fee')
    .in('status', OPEN_REQUEST_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(`open fee request read failed: ${error.code ?? ''}`)
  const rows = (data ?? []) as {
    request_id: string
    amount: number | string
    currency: string | null
    status: string
    created_at: string
    expires_at: string | null
  }[]
  const open = rows.find((r) => isRequestOpen(r, now))
  return open
    ? {
        id: open.request_id,
        amount: Number(open.amount),
        currency: String(open.currency ?? 'USD').toUpperCase(),
        requestedAt: open.created_at,
      }
    : null
}

/** `fetchOpenFeeRequest` with the service-role client, deduplicated per request. */
export const loadOpenFeeRequest = cache((tenantId: string) => fetchOpenFeeRequest(createAdminClient(), tenantId))
