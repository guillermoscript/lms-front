'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'

interface OnboardingData {
  schoolName: string
  schoolDescription: string
  logoUrl?: string
}

interface CreateSchoolData {
  schoolName: string
  slug: string
}

export async function createSchoolForUser(data: CreateSchoolData) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false as const, error: 'Not authenticated. Please sign in first.' }
    }

    const adminClient = createAdminClient()

    // 1. Create tenant
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .insert({
        name: data.schoolName,
        slug: data.slug,
        status: 'active',
      })
      .select('id')
      .single()

    if (tenantError) {
      if (tenantError.code === '23505') {
        return { success: false as const, error: 'This school URL is already taken. Please choose a different one.' }
      }
      return { success: false as const, error: 'Failed to create school: ' + tenantError.message }
    }

    // 2. Create tenant_user with admin role
    const { error: tuError } = await adminClient
      .from('tenant_users')
      .insert({
        tenant_id: tenant.id,
        user_id: user.id,
        role: 'admin',
        status: 'active',
      })

    if (tuError) {
      await adminClient.from('tenants').delete().eq('id', tenant.id)
      return { success: false as const, error: 'Failed to set up school admin.' }
    }

    // 3. Set initial tenant settings
    await adminClient
      .from('tenant_settings')
      .upsert([
        { tenant_id: tenant.id, setting_key: 'site_name', setting_value: { value: data.schoolName } },
      ], { onConflict: 'tenant_id,setting_key' })

    return { success: true as const, tenantId: tenant.id, slug: data.slug }
  } catch (error) {
    console.error('createSchoolForUser error:', error)
    return { success: false as const, error: 'An unexpected error occurred.' }
  }
}

export async function completeOnboarding(data: OnboardingData) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    // Update tenant name
    await adminClient
      .from('tenants')
      .update({ name: data.schoolName })
      .eq('id', tenantId)

    // Upsert tenant settings
    const settingsRows = [
      { tenant_id: tenantId, setting_key: 'site_name', setting_value: { value: data.schoolName } },
      { tenant_id: tenantId, setting_key: 'site_description', setting_value: { value: data.schoolDescription } },
    ]

    if (data.logoUrl) {
      settingsRows.push({ tenant_id: tenantId, setting_key: 'logo_url', setting_value: { value: data.logoUrl } })
    }

    await adminClient
      .from('tenant_settings')
      .upsert(settingsRows, { onConflict: 'tenant_id,setting_key' })

    // Mark onboarding as completed
    await adminClient
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id)

    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/teacher')

    return { success: true }
  } catch (error) {
    console.error('Onboarding error:', error)
    return { success: false, error: 'Failed to complete onboarding' }
  }
}
