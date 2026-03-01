'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'

async function verifySuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')
  return user
}

/**
 * Generate a new referral code for a tenant (or a platform-level code with no tenant).
 */
export async function generateReferralCode(opts: {
  tenantId?: string
  code?: string
  discountMonths?: number
  referrerRewardMonths?: number
  maxUses?: number
}) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const code = opts.code || Math.random().toString(36).slice(2, 8).toUpperCase()

  const { data, error } = await adminClient
    .from('referral_codes')
    .insert({
      code,
      tenant_id: opts.tenantId || null,
      discount_months: opts.discountMonths ?? 1,
      referrer_reward_months: opts.referrerRewardMonths ?? 1,
      max_uses: opts.maxUses || null,
      is_active: true,
    })
    .select('code_id, code')
    .single()

  if (error) throw new Error(`Failed to create referral code: ${error.message}`)
  revalidatePath('/platform/referrals')
  return data
}

/**
 * Apply a referral code when a new tenant signs up.
 * Called from onboarding action after tenant is created.
 */
export async function applyReferralCode(code: string, newTenantId: string) {
  const adminClient = createAdminClient()

  // Validate code
  const { data: referralCode } = await adminClient
    .from('referral_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .maybeSingle()

  if (!referralCode) return { applied: false, reason: 'Invalid or inactive code' }
  if (referralCode.max_uses !== null && referralCode.used_count >= referralCode.max_uses) {
    return { applied: false, reason: 'Code has reached maximum uses' }
  }

  // Check not self-referral
  if (referralCode.tenant_id === newTenantId) {
    return { applied: false, reason: 'Cannot self-refer' }
  }

  // Check not already redeemed by this tenant
  const { data: existing } = await adminClient
    .from('referral_redemptions')
    .select('redemption_id')
    .eq('redeemed_by_tenant_id', newTenantId)
    .maybeSingle()

  if (existing) return { applied: false, reason: 'Already redeemed a referral' }

  // Insert redemption record
  await adminClient
    .from('referral_redemptions')
    .insert({
      code_id: referralCode.code_id,
      redeemed_by_tenant_id: newTenantId,
      referrer_rewarded: false,
      referee_rewarded: false,
    })

  // Extend new tenant billing_period_end by discount_months (referee benefit)
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('billing_period_end')
    .eq('id', newTenantId)
    .single()

  const base = tenant?.billing_period_end ? new Date(tenant.billing_period_end) : new Date()
  base.setMonth(base.getMonth() + referralCode.discount_months)

  await adminClient
    .from('tenants')
    .update({ billing_period_end: base.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', newTenantId)

  // Mark referee as rewarded
  await adminClient
    .from('referral_redemptions')
    .update({ referee_rewarded: true })
    .eq('code_id', referralCode.code_id)
    .eq('redeemed_by_tenant_id', newTenantId)

  // Increment used_count
  await adminClient
    .from('referral_codes')
    .update({ used_count: referralCode.used_count + 1 })
    .eq('code_id', referralCode.code_id)

  return { applied: true }
}

/**
 * Reward the referrer when the new tenant makes their first paid plan activation.
 * Call this from confirmManualPayment or platform-webhook invoice.paid.
 */
export async function rewardReferrer(newTenantId: string) {
  const adminClient = createAdminClient()

  const { data: redemption } = await adminClient
    .from('referral_redemptions')
    .select('*, referral_codes(referrer_reward_months, tenant_id)')
    .eq('redeemed_by_tenant_id', newTenantId)
    .eq('referrer_rewarded', false)
    .maybeSingle()

  if (!redemption) return { rewarded: false }

  const code = redemption.referral_codes as { referrer_reward_months: number; tenant_id: string | null } | null
  const referrerTenantId = code?.tenant_id
  const rewardMonths = code?.referrer_reward_months ?? 1

  if (!referrerTenantId) return { rewarded: false }

  // Extend referrer's billing_period_end
  const { data: referrerTenant } = await adminClient
    .from('tenants')
    .select('billing_period_end')
    .eq('id', referrerTenantId)
    .single()

  const base = referrerTenant?.billing_period_end
    ? new Date(referrerTenant.billing_period_end)
    : new Date()
  base.setMonth(base.getMonth() + rewardMonths)

  await adminClient
    .from('tenants')
    .update({ billing_period_end: base.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', referrerTenantId)

  await adminClient
    .from('referral_redemptions')
    .update({ referrer_rewarded: true })
    .eq('redemption_id', redemption.redemption_id)

  return { rewarded: true }
}

export async function getReferralStats() {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const [codesResult, redemptionsResult] = await Promise.all([
    adminClient
      .from('referral_codes')
      .select('*, tenants(name, slug)')
      .order('created_at', { ascending: false }),
    adminClient
      .from('referral_redemptions')
      .select('*, referral_codes(code, tenant_id), tenants!referral_redemptions_redeemed_by_tenant_id_fkey(name, slug)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return {
    codes: codesResult.data || [],
    redemptions: redemptionsResult.data || [],
  }
}

export async function deactivateReferralCode(codeId: string) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('referral_codes')
    .update({ is_active: false })
    .eq('code_id', codeId)

  if (error) throw new Error(`Failed to deactivate code: ${error.message}`)
  revalidatePath('/platform/referrals')
  return { success: true }
}
