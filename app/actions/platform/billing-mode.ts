'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { normalizeBillingMode } from '@/lib/billing/billing-mode'
import { validateBillingModeInput } from '@/lib/billing/billing-mode-input'
import { syncTenantPlan } from '@/lib/billing/sync-tenant-plan'

async function verifySuperAdmin() {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')
  return userId
}

/**
 * Super admin: set a school's billing mode (paid | comped | internal).
 * Design: docs/INTERNAL_COMPED_SCHOOLS.md. The audit row is written by the
 * `trg_log_tenant_billing_mode` DB trigger, not here.
 */
export async function setTenantBillingMode(input: {
  tenantId: string
  mode: string
  plan?: string | null
  comped_until?: string | null
  fee_percent_override?: number | string | null
  reason?: string | null
}) {
  const superAdminId = await verifySuperAdmin()

  const parsed = validateBillingModeInput(input)
  if (!parsed.ok) throw new Error(Object.values(parsed.errors).join('; '))
  const v = parsed.value

  const adminClient = createAdminClient()
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('billing_mode, comped_until')
    .eq('id', input.tenantId)
    .maybeSingle()
  if (!tenant) throw new Error('Tenant not found')

  const currentMode = normalizeBillingMode(tenant.billing_mode)
  const nowIso = new Date().toISOString()

  // Plan first (paid keeps the current plan), then the mode fields: a real failure
  // in the sync must not leave the school marked comped on its old plan.
  if (v.plan) await syncTenantPlan(adminClient, input.tenantId, v.plan, nowIso)

  const untilChanged =
    (tenant.comped_until ? new Date(tenant.comped_until).toISOString() : null) !== v.comped_until
  const update =
    v.mode === 'paid'
      ? {
          billing_mode: 'paid',
          comped_until: null,
          comped_reason: null,
          comped_by: null,
          comped_at: null,
          fee_percent_override: null,
          comped_notice_sent: {},
          updated_at: nowIso,
        }
      : {
          billing_mode: v.mode,
          comped_until: v.comped_until,
          comped_reason: v.reason,
          comped_by: superAdminId,
          comped_at: nowIso,
          fee_percent_override: v.fee_percent_override,
          ...(currentMode !== v.mode || untilChanged ? { comped_notice_sent: {} } : {}),
          updated_at: nowIso,
        }

  const { error } = await adminClient.from('tenants').update(update).eq('id', input.tenantId)
  if (error) throw new Error(`Failed to set billing mode: ${error.message}`)

  await reconcileAccessCutoffSafely(adminClient, input.tenantId)

  revalidatePath('/platform/tenants')
  return { success: true }
}
