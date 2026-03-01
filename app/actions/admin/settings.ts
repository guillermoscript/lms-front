'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'

interface SettingsResponse {
  success: boolean
  data?: Record<string, any>
  error?: string
}

/**
 * Get all tenant settings or settings filtered by key prefix
 */
export async function getSettings(category?: string): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    let query = supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('setting_key')

    if (category) {
      // Filter by category prefix (e.g. 'smtp_' for email settings)
      const categoryPrefixes: Record<string, string[]> = {
        general: ['site_name', 'site_description', 'contact_email', 'support_email', 'timezone', 'maintenance_mode'],
        email: ['smtp_', 'email_'],
        payment: ['stripe_', 'paypal_', 'currency', 'tax_rate', 'invoice_prefix', 'require_payment_approval'],
        enrollment: ['auto_enrollment', 'require_enrollment_approval', 'max_enrollments_per_user', 'allow_self_enrollment', 'enrollment_expiration_days', 'course_capacity_enabled'],
      }
      const keys = categoryPrefixes[category]
      if (keys) {
        query = query.or(keys.map(k => k.endsWith('_') ? `setting_key.like.${k}%` : `setting_key.eq.${k}`).join(','))
      }
    }

    const { data, error } = await query

    if (error) throw error

    const settings = (data || []).reduce((acc: Record<string, any>, s: any) => {
      acc[s.setting_key] = s.setting_value
      return acc
    }, {})

    return { success: true, data: settings }
  } catch (error) {
    console.error('Error fetching settings:', error)
    return { success: false, error: 'Failed to fetch settings' }
  }
}

/**
 * Get a single setting by key
 */
export async function getSetting(key: string): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('setting_key', key)
      .single()

    if (error) throw error

    return { success: true, data: data.setting_value }
  } catch (error) {
    console.error('Error fetching setting:', error)
    return { success: false, error: 'Failed to fetch setting' }
  }
}

/**
 * Update a setting by key (upsert into tenant_settings)
 */
export async function updateSetting(
  key: string,
  value: any
): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    if (typeof value !== 'object' || value === null) {
      return { success: false, error: 'Setting value must be an object' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_settings')
      .upsert(
        { tenant_id: tenantId, setting_key: key, setting_value: value },
        { onConflict: 'tenant_id,setting_key' }
      )
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/admin')

    return { success: true, data: data.setting_value }
  } catch (error) {
    console.error('Error updating setting:', error)
    return { success: false, error: 'Failed to update setting' }
  }
}

/**
 * Update multiple settings at once (bulk upsert)
 */
export async function updateSettings(
  settings: Record<string, any>
): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const rows = Object.entries(settings).map(([key, value]) => ({
      tenant_id: tenantId,
      setting_key: key,
      setting_value: value,
    }))

    const { error } = await supabase
      .from('tenant_settings')
      .upsert(rows, { onConflict: 'tenant_id,setting_key' })

    if (error) throw error

    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/admin')

    return { success: true, data: settings }
  } catch (error) {
    console.error('Error updating settings:', error)
    return { success: false, error: 'Failed to update settings' }
  }
}

/**
 * Reset a setting to its default value
 */
export async function resetSetting(key: string): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const defaults: Record<string, any> = {
      site_name: { value: 'My School' },
      site_description: { value: 'An online learning platform' },
      contact_email: { value: 'contact@example.com' },
      support_email: { value: 'support@example.com' },
      timezone: { value: 'America/New_York' },
      maintenance_mode: { enabled: false, message: '' },
      smtp_host: { value: '' },
      smtp_port: { value: 587 },
      smtp_username: { value: '' },
      smtp_password: { value: '' },
      smtp_from_email: { value: 'noreply@example.com' },
      smtp_from_name: { value: 'My School' },
      email_notifications: { enabled: true },
      stripe_enabled: { enabled: true },
      paypal_enabled: { enabled: false },
      currency: { value: 'USD' },
      tax_rate: { value: 0 },
      invoice_prefix: { value: 'INV' },
      require_payment_approval: { enabled: false },
      auto_enrollment: { enabled: false },
      require_enrollment_approval: { enabled: false },
      max_enrollments_per_user: { value: 0 },
      allow_self_enrollment: { enabled: true },
      enrollment_expiration_days: { value: 365 },
      course_capacity_enabled: { enabled: false },
      logo_url: { value: '' },
      primary_color: { value: '#2563eb' },
      secondary_color: { value: '#7c3aed' },
      favicon_url: { value: '' },
    }

    const defaultValue = defaults[key]
    if (!defaultValue) {
      return { success: false, error: 'Unknown setting key' }
    }

    return updateSetting(key, defaultValue)
  } catch (error) {
    console.error('Error resetting setting:', error)
    return { success: false, error: 'Failed to reset setting' }
  }
}

/**
 * Get all settings grouped by category (for the settings page)
 */
export async function getAllSettingsByCategory(): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('setting_key')

    if (error) throw error

    // Categorize by setting key prefix
    const categoryMap: Record<string, string> = {
      site_name: 'general', site_description: 'general', contact_email: 'general',
      support_email: 'general', timezone: 'general', maintenance_mode: 'general',
      logo_url: 'general', favicon_url: 'general', primary_color: 'general', secondary_color: 'general',
      smtp_host: 'email', smtp_port: 'email', smtp_username: 'email', smtp_password: 'email',
      smtp_from_email: 'email', smtp_from_name: 'email', email_notifications: 'email',
      stripe_enabled: 'payment', paypal_enabled: 'payment', currency: 'payment',
      tax_rate: 'payment', invoice_prefix: 'payment', require_payment_approval: 'payment',
      auto_enrollment: 'enrollment', require_enrollment_approval: 'enrollment',
      max_enrollments_per_user: 'enrollment', allow_self_enrollment: 'enrollment',
      enrollment_expiration_days: 'enrollment', course_capacity_enabled: 'enrollment',
    }

    const grouped = (data || []).reduce((acc: Record<string, Record<string, any>>, s: any) => {
      const category = categoryMap[s.setting_key] || 'general'
      if (!acc[category]) acc[category] = {}
      acc[category][s.setting_key] = {
        value: s.setting_value,
        description: null,
      }
      return acc
    }, {})

    return { success: true, data: grouped }
  } catch (error) {
    console.error('Error fetching settings by category:', error)
    return { success: false, error: 'Failed to fetch settings' }
  }
}
