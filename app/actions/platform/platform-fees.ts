'use server'

/**
 * Super-admin platform fee ledger actions (#929, design 4.4 / step 7).
 *
 * Each action verifies `isSuperAdmin()` (reads `super_admins`, never a JWT
 * claim), then calls ONE SECURITY DEFINER function through
 * `lib/billing/platform-fee-admin.ts` with the verified user id as actor. The
 * function re-checks the actor, writes the ledger append-only, appends
 * `platform_fee_audit_log` and re-evaluates standing in one transaction.
 *
 * Results are returned, never thrown: a thrown server-action error is masked
 * in production, and the dialogs need a code to show a localized message.
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import {
  confirmFeeRequest,
  FeeLedgerActionError,
  recordFeePayment,
  reverseFeePayment,
  setFeeExemption,
} from '@/lib/billing/platform-fee-admin'
import {
  isUuid,
  parseFeePaymentInput,
  parseFeeReason,
  type FeeAdminInputError,
} from '@/lib/billing/platform-fee-admin-input'

export type FeeActionErrorCode =
  | FeeAdminInputError
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'not_settled'
  | 'internal'

export type FeeActionResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: FeeActionErrorCode }

async function verifySuperAdmin(): Promise<string | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null
  if (!(await isSuperAdmin())) return null
  return userId
}

function fail(err: unknown): { ok: false; error: FeeActionErrorCode } {
  if (err instanceof FeeLedgerActionError) {
    console.error('[platform-fees] action failed:', err.code, err.message)
    return { ok: false, error: err.code === 'invalid' ? 'invalid_amount' : err.code }
  }
  console.error('[platform-fees] action failed:', err instanceof Error ? err.message : err)
  return { ok: false, error: 'internal' }
}

function revalidateTenant() {
  revalidatePath('/[locale]/platform/tenants/[tenantId]', 'page')
  revalidatePath('/[locale]/platform/billing', 'page')
}

/** Money for a manual fee request has arrived: credit it. Replay-safe. */
export async function confirmPlatformFeeRequestAction(
  requestId: string,
): Promise<FeeActionResult<{ applied: boolean }>> {
  const actorId = await verifySuperAdmin()
  if (!actorId) return { ok: false, error: 'forbidden' }
  if (!isUuid(requestId)) return { ok: false, error: 'invalid_id' }
  try {
    const result = await confirmFeeRequest(createAdminClient(), requestId, actorId)
    revalidateTenant()
    return { ok: true, value: { applied: result.applied } }
  } catch (err) {
    return fail(err)
  }
}

/** Record money received off-platform, or waive part of the balance. */
export async function recordPlatformFeePaymentAction(raw: {
  tenantId: string
  currency: string
  amount: string
  kind: 'offline' | 'waiver'
  reason: string
  reference?: string
}): Promise<FeeActionResult<{ paymentId: string }>> {
  const actorId = await verifySuperAdmin()
  if (!actorId) return { ok: false, error: 'forbidden' }
  const parsed = parseFeePaymentInput(raw)
  if (!parsed.ok) return parsed
  try {
    const paymentId = await recordFeePayment(createAdminClient(), parsed.value, actorId)
    revalidateTenant()
    return { ok: true, value: { paymentId } }
  } catch (err) {
    return fail(err)
  }
}

/** Adjust down: reverse one credited payment (bounced transfer, mistaken entry). */
export async function reversePlatformFeePaymentAction(paymentId: string, reason: string): Promise<FeeActionResult> {
  const actorId = await verifySuperAdmin()
  if (!actorId) return { ok: false, error: 'forbidden' }
  if (!isUuid(paymentId)) return { ok: false, error: 'invalid_id' }
  const r = parseFeeReason(reason)
  if (!r.ok) return r
  try {
    const outcome = await reverseFeePayment(createAdminClient(), paymentId, r.value, actorId)
    if (outcome === 'not_found') return { ok: false, error: 'not_found' }
    if (outcome === 'not_settled') return { ok: false, error: 'not_settled' }
    revalidateTenant()
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

/** Exempt a school from the sales pause (lifts an active block) or end the exemption. */
export async function setPlatformFeeExemptionAction(
  tenantId: string,
  exempt: boolean,
  reason: string,
): Promise<FeeActionResult> {
  const actorId = await verifySuperAdmin()
  if (!actorId) return { ok: false, error: 'forbidden' }
  if (!isUuid(tenantId)) return { ok: false, error: 'invalid_id' }
  if (typeof exempt !== 'boolean') return { ok: false, error: 'invalid_kind' }
  const r = parseFeeReason(reason)
  if (!r.ok) return r
  try {
    await setFeeExemption(createAdminClient(), tenantId, exempt, r.value, actorId)
    revalidateTenant()
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}
