'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'

/**
 * Get the active referral code for the current tenant, creating one if it doesn't exist.
 * Only callable by tenant admins.
 */
export async function getOrCreateTenantReferralCode() {
  const role = await getUserRole()
  if (role !== 'admin') throw new Error('Admin only')

  const tenantId = await getCurrentTenantId()
  const adminClient = createAdminClient()

  // Check for existing active code
  const { data: existing } = await adminClient
    .from('referral_codes')
    .select('code_id, code, used_count, discount_months, referrer_reward_months, max_uses')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  // Create a new code for this tenant
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single()

  const slug = (tenant?.slug || 'school').toUpperCase().slice(0, 6)
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase()
  const code = `${slug}${suffix}`

  const { data: created, error } = await adminClient
    .from('referral_codes')
    .insert({
      code,
      tenant_id: tenantId,
      discount_months: 1,
      referrer_reward_months: 1,
      max_uses: null,
      is_active: true,
    })
    .select('code_id, code, used_count, discount_months, referrer_reward_months, max_uses')
    .single()

  if (error) throw new Error(`Failed to create referral code: ${error.message}`)
  return created
}
