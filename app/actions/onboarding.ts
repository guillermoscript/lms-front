'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track, upsertSchoolGroup } from '@/lib/analytics/server'
import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'

interface OnboardingData {
  schoolName: string
  schoolDescription: string
  logoUrl?: string
}

interface CreateSchoolData {
  schoolName: string
  slug: string
}

/**
 * Best-effort request locale. `getLocale()` throws outside a request scope, and
 * an unknown locale is a missing analytics dimension, never a failed action.
 */
async function analyticsLocale(): Promise<string | undefined> {
  try {
    return await getLocale()
  } catch {
    return undefined
  }
}

export async function createSchoolForUser(data: CreateSchoolData) {
  // Loop A denominator. `/create-school` submits straight into this action, so
  // firing here — before the first write — is what makes the drop-off between
  // "tried to create a school" and `school_created` visible; the common failure
  // (slug already taken) returns below without ever reaching the success event.
  const startedAt = Date.now()
  await track(ANALYTICS_EVENTS.SCHOOL_SIGNUP_STARTED, { source: 'create_school' })

  try {
    const supabase = await createClient()
    const userId = await getCurrentUserId()
    if (!userId) {
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
      .select('id, plan, created_at')
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
        user_id: userId,
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

    // §2.1 — register the school as an OpenPanel group so every later event
    // rolls up to it. The helper fails soft on instances without the Groups
    // feature; the flat `tenant_id` property keeps carrying the data.
    const locale = await analyticsLocale()
    await upsertSchoolGroup({
      tenantId: tenant.id,
      name: data.schoolName,
      properties: {
        plan: tenant.plan ?? 'free',
        locale: locale ?? null,
        created_at: tenant.created_at ?? null,
      },
    })

    await track(
      ANALYTICS_EVENTS.SCHOOL_CREATED,
      {
        plan: tenant.plan ?? 'free',
        // PRODUCT.md targets sub-5-minute setup (#432); this is what makes that
        // claim measurable instead of aspirational.
        time_to_create_ms: Date.now() - startedAt,
      },
      { userId, tenantId: tenant.id, role: 'admin', locale }
    )

    return { success: true as const, tenantId: tenant.id, slug: data.slug }
  } catch (error) {
    console.error('createSchoolForUser error:', error)
    return { success: false as const, error: 'An unexpected error occurred.' }
  }
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
      { userId, tenantId, role: 'admin', locale: await analyticsLocale() }
    )

    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/teacher')

    return { success: true }
  } catch (error) {
    console.error('Onboarding error:', error)
    return { success: false, error: 'Failed to complete onboarding' }
  }
}
