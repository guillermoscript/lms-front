'use server'

/**
 * Super-admin platform bank account actions (#929). Each verifies
 * `isSuperAdmin()` (reads `super_admins`, never a JWT claim), then calls ONE
 * SECURITY DEFINER function with the verified user id as actor; the function
 * re-checks the actor and appends `platform_fee_audit_log` in the same
 * transaction. Tenant-free: these accounts belong to the platform.
 *
 * Results are returned, never thrown (a thrown server-action error is masked
 * in production). Account details are never logged.
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import { isUuid } from '@/lib/billing/platform-fee-admin-input'
import { parseBankAccountInput, type BankAccountField } from '@/lib/billing/platform-bank-account-input'

export type BankAccountActionError = 'forbidden' | 'invalid' | 'invalid_id' | 'not_found' | 'duplicate_currency' | 'internal'

export type BankAccountActionResult<T = undefined> =
  | { ok: true; value?: T }
  | { ok: false; error: BankAccountActionError; fields?: BankAccountField[] }

async function verifySuperAdmin(): Promise<string | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null
  if (!(await isSuperAdmin())) return null
  return userId
}

function mapError(error: { code?: string; message?: string }): BankAccountActionResult<never> {
  switch (error.code) {
    case '42501':
      return { ok: false, error: 'forbidden' }
    case 'P0002':
      return { ok: false, error: 'not_found' }
    case '23505':
      return { ok: false, error: 'duplicate_currency' }
    case '23514':
    case '22023':
      return { ok: false, error: 'invalid' }
    default:
      // Code only: the message can echo a value.
      console.error('[platform-bank-accounts] action failed:', error.code)
      return { ok: false, error: 'internal' }
  }
}

function revalidate() {
  revalidatePath('/[locale]/platform/bank-accounts', 'page')
  revalidatePath('/[locale]/platform/tenants/[tenantId]', 'page')
  revalidatePath('/[locale]/dashboard/admin/earnings', 'page')
}

/** Create (`id` omitted) or update one account. */
export async function savePlatformBankAccountAction(
  id: string | null,
  raw: unknown,
): Promise<BankAccountActionResult<{ id: string }>> {
  const actorId = await verifySuperAdmin()
  if (!actorId) return { ok: false, error: 'forbidden' }
  if (id !== null && !isUuid(id)) return { ok: false, error: 'invalid_id' }
  const parsed = parseBankAccountInput(raw)
  if (!parsed.ok) return { ok: false, error: 'invalid', fields: parsed.fields }
  const v = parsed.value
  try {
    const { data, error } = await createAdminClient().rpc('save_platform_bank_account', {
      _actor: actorId,
      _id: id,
      _currency: v.currency,
      _label: v.label,
      _bank_name: v.bankName,
      _account_holder: v.accountHolder,
      _account_number: v.accountNumber,
      _account_type: v.accountType,
      _routing_number: v.routingNumber,
      _swift_code: v.swiftCode,
      _extra_instructions: v.extraInstructions,
      _sort_order: v.sortOrder,
      _is_active: v.isActive,
    })
    if (error) return mapError(error)
    revalidate()
    return { ok: true, value: { id: String(data) } }
  } catch {
    console.error('[platform-bank-accounts] save threw')
    return { ok: false, error: 'internal' }
  }
}

/** Activate or deactivate one account (no-op when already in that state). */
export async function setPlatformBankAccountActiveAction(
  id: string,
  active: boolean,
): Promise<BankAccountActionResult> {
  const actorId = await verifySuperAdmin()
  if (!actorId) return { ok: false, error: 'forbidden' }
  if (!isUuid(id)) return { ok: false, error: 'invalid_id' }
  if (typeof active !== 'boolean') return { ok: false, error: 'invalid' }
  try {
    const { error } = await createAdminClient().rpc('set_platform_bank_account_active', {
      _actor: actorId,
      _id: id,
      _active: active,
    })
    if (error) return mapError(error)
    revalidate()
    return { ok: true }
  } catch {
    console.error('[platform-bank-accounts] set active threw')
    return { ok: false, error: 'internal' }
  }
}
