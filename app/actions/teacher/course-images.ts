'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { nanoid } from 'nanoid'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function uploadCourseImage(
  formData: FormData
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const role = await getUserRole()
    if (role !== 'teacher' && role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const file = formData.get('file') as File | null
    if (!file) return { success: false, error: 'No file provided' }
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'File size must be under 5MB' }
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { success: false, error: 'File type not allowed. Use JPEG, PNG, GIF, or WebP.' }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${tenantId}/${nanoid()}.${ext}`

    const adminClient = createAdminClient()
    const { error } = await adminClient.storage
      .from('course-images')
      .upload(filePath, file, { contentType: file.type, upsert: false })

    if (error) throw error

    const { data: urlData } = adminClient.storage
      .from('course-images')
      .getPublicUrl(filePath)

    return { success: true, url: urlData.publicUrl }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to upload image',
    }
  }
}
