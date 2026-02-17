'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'

interface OnboardingData {
  schoolName: string
  schoolDescription: string
  logoUrl?: string
  primaryColor?: string
  secondaryColor?: string
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
    if (data.primaryColor) {
      settingsRows.push({ tenant_id: tenantId, setting_key: 'primary_color', setting_value: { value: data.primaryColor } })
    }
    if (data.secondaryColor) {
      settingsRows.push({ tenant_id: tenantId, setting_key: 'secondary_color', setting_value: { value: data.secondaryColor } })
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
