/**
 * App-layer pre-check of the platform fee sales block (#929, design 4.3 layer 2).
 *
 * The DB trigger on `transactions` INSERT is the authoritative gate; this
 * pre-check exists so a blocked school's checkout fails with friendly copy
 * BEFORE any provider session, pending row or payment request is created
 * (check order: auth → access → role → sales gate → limits → side effects).
 *
 * It calls the SAME SQL predicate the trigger calls,
 * `transaction_sales_gate_allows()`, so the renewal exemption (4.2a) and the
 * pre-block manual settlement can never drift between the two layers.
 *
 * Unlike `findConflictingSubscription` (fail closed), this FAILS OPEN on a
 * query error: an unknown state must not stop sales. The trigger still
 * decides at insert time.
 *
 * Every `transactions` insert site and every free self-enroll RPC call site
 * must call `assertSalesOpen` first — tests/unit/sales-gate-contract.test.ts
 * enforces it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { SalesBlockedError } from '@/lib/billing/sales-block-error'

export type SalesGateContext =
  | {
      kind: 'transaction'
      userId: string | null
      productId?: number | string | null
      planId?: number | string | null
      /** transactions.payment_provider the insert will carry (renewals must match the rail). */
      paymentProvider: string
      providerSubscriptionId?: string | null
    }
  | { kind: 'free_enrollment'; userId: string; courseId: number | string }

const toInt = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * `true` when the tenant may take this sale / enrollment now. Fails open
 * (returns true) when the gate cannot be read.
 */
export async function isSalesOpen(
  tenantId: string,
  ctx: SalesGateContext,
  client?: SupabaseClient,
): Promise<boolean> {
  try {
    const admin = client ?? createAdminClient()
    const { data, error } =
      ctx.kind === 'transaction'
        ? await admin.rpc('transaction_sales_gate_allows', {
            _tenant_id: tenantId,
            _user_id: ctx.userId,
            _product_id: toInt(ctx.productId),
            _plan_id: toInt(ctx.planId),
            _payment_provider: ctx.paymentProvider,
            _provider_subscription_id: ctx.providerSubscriptionId ?? null,
          })
        : await admin.rpc('free_enrollment_allowed', {
            _tenant_id: tenantId,
            _user_id: ctx.userId,
            _course_id: toInt(ctx.courseId),
          })
    if (error) {
      console.error('[sales-gate] gate read failed, failing open:', error.code, error.message)
      return true
    }
    return data !== false
  } catch (err) {
    console.error('[sales-gate] gate read threw, failing open:', err instanceof Error ? err.message : err)
    return true
  }
}

/** Throws `SalesBlockedError` when the tenant's new sales are blocked (#929). */
export async function assertSalesOpen(
  tenantId: string,
  ctx: SalesGateContext,
  client?: SupabaseClient,
): Promise<void> {
  if (!(await isSalesOpen(tenantId, ctx, client))) {
    throw new SalesBlockedError()
  }
}
