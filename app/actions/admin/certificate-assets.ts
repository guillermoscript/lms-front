'use server'

import { createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { nanoid } from 'nanoid'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']

async function verifyTeacherOrAdminAccess() {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') {
    throw new Error('Unauthorized: Teacher or Admin access required')
  }
}

export async function uploadCertificateAsset(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  try {
    await verifyTeacherOrAdminAccess()
    const tenantId = await getCurrentTenantId()
    const file = formData.get('file') as File | null
    const assetType = formData.get('type') as string | null // 'logo' | 'signature'

    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'File size must be under 2MB' }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { success: false, error: 'File type not allowed. Use JPEG, PNG, GIF, WebP, or SVG.' }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const prefix = assetType === 'signature' ? 'sig' : 'logo'
    const fileName = `${prefix}-${nanoid()}.${ext}`
    const filePath = `${tenantId}/certificates/${fileName}`

    const adminClient = createAdminClient()
    const { error } = await adminClient.storage
      .from('landing-page-assets')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (error) throw error

    const { data: urlData } = adminClient.storage
      .from('landing-page-assets')
      .getPublicUrl(filePath)

    return {
      success: true,
      data: { url: urlData.publicUrl },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to upload image',
    }
  }
}
