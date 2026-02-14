'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'

type SettingCategory = 'general' | 'email' | 'payment' | 'enrollment'

interface SystemSetting {
  id: number
  setting_key: string
  setting_value: any
  category: SettingCategory
  description: string | null
  created_at: string
  updated_at: string
}

interface SettingsResponse {
  success: boolean
  data?: Record<string, any>
  error?: string
}

/**
 * Get all settings or settings by category
 */
export async function getSettings(category?: SettingCategory): Promise<SettingsResponse> {
  try {
    // Verify admin role
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = createAdminClient()

    let query = supabase
      .from('system_settings')
      .select('*')
      .order('setting_key')

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) throw error

    // Transform array to object for easier access
    const settings = data.reduce((acc: Record<string, any>, setting: SystemSetting) => {
      acc[setting.setting_key] = setting.setting_value
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
    // Verify admin role
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
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
 * Update a setting by key
 */
export async function updateSetting(
  key: string,
  value: any
): Promise<SettingsResponse> {
  try {
    // Verify admin role
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = createAdminClient()

    // Validate value is an object
    if (typeof value !== 'object' || value === null) {
      return { success: false, error: 'Setting value must be an object' }
    }

    const { data, error } = await supabase
      .from('system_settings')
      .update({ setting_value: value })
      .eq('setting_key', key)
      .select()
      .single()

    if (error) throw error

    // Revalidate relevant pages
    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/admin')

    return { success: true, data: data.setting_value }
  } catch (error) {
    console.error('Error updating setting:', error)
    return { success: false, error: 'Failed to update setting' }
  }
}

/**
 * Update multiple settings at once (bulk update)
 */
export async function updateSettings(
  settings: Record<string, any>
): Promise<SettingsResponse> {
  try {
    // Verify admin role
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = createAdminClient()

    // Update each setting individually
    const updatePromises = Object.entries(settings).map(([key, value]) => {
      return supabase
        .from('system_settings')
        .update({ setting_value: value })
        .eq('setting_key', key)
    })

    const results = await Promise.all(updatePromises)

    // Check if any updates failed
    const failed = results.find(result => result.error)
    if (failed) {
      throw failed.error
    }

    // Revalidate relevant pages
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
    // Verify admin role
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = createAdminClient()

    // Get the default value from the migration
    const defaults: Record<string, any> = {
      site_name: { value: 'LMS V2' },
      site_description: { value: 'A modern learning management system' },
      contact_email: { value: 'contact@example.com' },
      support_email: { value: 'support@example.com' },
      timezone: { value: 'America/New_York' },
      maintenance_mode: { enabled: false, message: '' },
      smtp_host: { value: '' },
      smtp_port: { value: 587 },
      smtp_username: { value: '' },
      smtp_password: { value: '' },
      smtp_from_email: { value: 'noreply@example.com' },
      smtp_from_name: { value: 'LMS V2' },
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
    }

    const defaultValue = defaults[key]
    if (!defaultValue) {
      return { success: false, error: 'Unknown setting key' }
    }

    const { data, error } = await supabase
      .from('system_settings')
      .update({ setting_value: defaultValue })
      .eq('setting_key', key)
      .select()
      .single()

    if (error) throw error

    // Revalidate relevant pages
    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/admin')

    return { success: true, data: data.setting_value }
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
    // Verify admin role
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .order('category')
      .order('setting_key')

    if (error) throw error

    // Group by category
    const grouped = data.reduce((acc: Record<string, Record<string, any>>, setting: SystemSetting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = {}
      }
      acc[setting.category][setting.setting_key] = {
        value: setting.setting_value,
        description: setting.description,
      }
      return acc
    }, {})

    return { success: true, data: grouped }
  } catch (error) {
    console.error('Error fetching settings by category:', error)
    return { success: false, error: 'Failed to fetch settings' }
  }
}
