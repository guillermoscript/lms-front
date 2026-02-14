'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'

type TemplateCategory = 'system' | 'course' | 'payment' | 'enrollment' | 'exam' | 'custom'

interface TemplateData {
  name: string
  title: string
  content: string
  category: TemplateCategory
  variables?: string[]
}

interface ActionResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Get all notification templates
 */
export async function getNotificationTemplates(
  category?: TemplateCategory
): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin' && role !== 'teacher') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = await createClient()

    let query = supabase
      .from('notification_templates')
      .select('*')
      .order('category')
      .order('name')

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) throw error

    return { success: true, data }
  } catch (error) {
    console.error('Error fetching templates:', error)
    return { success: false, error: 'Failed to fetch templates' }
  }
}

/**
 * Get single template
 */
export async function getNotificationTemplate(id: number): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin' && role !== 'teacher') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (error) {
    console.error('Error fetching template:', error)
    return { success: false, error: 'Failed to fetch template' }
  }
}

/**
 * Create notification template
 */
export async function createNotificationTemplate(
  data: TemplateData
): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminClient = createAdminClient()

    const { data: template, error } = await adminClient
      .from('notification_templates')
      .insert({
        ...data,
        variables: data.variables || [],
        created_by: user.id,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/admin/notifications/templates')
    return { success: true, data: template }
  } catch (error) {
    console.error('Error creating template:', error)
    return { success: false, error: 'Failed to create template' }
  }
}

/**
 * Update notification template
 */
export async function updateNotificationTemplate(
  id: number,
  data: Partial<TemplateData>
): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const adminClient = createAdminClient()

    const { data: template, error } = await adminClient
      .from('notification_templates')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/admin/notifications/templates')
    return { success: true, data: template }
  } catch (error) {
    console.error('Error updating template:', error)
    return { success: false, error: 'Failed to update template' }
  }
}

/**
 * Delete notification template
 */
export async function deleteNotificationTemplate(id: number): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from('notification_templates')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/dashboard/admin/notifications/templates')
    return { success: true }
  } catch (error) {
    console.error('Error deleting template:', error)
    return { success: false, error: 'Failed to delete template' }
  }
}

/**
 * Render template with variables
 */
export async function renderTemplate(
  template: string,
  variables: Record<string, string>
): Promise<string> {
  let rendered = template

  // Replace {{variable_name}} with actual values
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g')
    rendered = rendered.replace(regex, value)
  })

  return rendered
}
