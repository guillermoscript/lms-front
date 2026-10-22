'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import { revalidatePath } from 'next/cache'
import { bestEffortLocale } from '@/lib/i18n/best-effort-locale'

interface OnboardingData {
  schoolName: string
  schoolDescription: string
  logoUrl?: string
}

export async function completeOnboarding(data: OnboardingData) {
  try {
    const supabase = await createClient()
    const userId = await getCurrentUserId()
    if (!userId) {
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
      .eq('id', userId)

    // No `duration_ms`: this action only sees its own commit, not the wizard.
    // Real per-step timings and `steps_skipped` live in the client, which owns
    // `onboarding_step_completed` — emitting a server-side `duration_ms` here
    // would be a field that looks like wizard duration and isn't. What the
    // server can say truthfully is which optional fields the owner filled in.
    await track(
      ANALYTICS_EVENTS.ONBOARDING_COMPLETED,
      {
        has_logo: Boolean(data.logoUrl),
        has_description: Boolean(data.schoolDescription?.trim()),
      },
      { userId, tenantId, role: 'admin', locale: await bestEffortLocale() }
    )

    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/teacher')

    return { success: true }
  } catch (error) {
    console.error('Onboarding error:', error)
    return { success: false, error: 'Failed to complete onboarding' }
  }
}
