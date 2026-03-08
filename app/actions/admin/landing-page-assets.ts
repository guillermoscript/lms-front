'use server'

import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { nanoid } from 'nanoid'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']

export async function uploadLandingPageAsset(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'File size must be under 5MB' }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { success: false, error: 'File type not allowed. Use JPEG, PNG, GIF, WebP, or SVG.' }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${nanoid()}.${ext}`
    const filePath = `${tenantId}/${fileName}`

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

export async function deleteLandingPageAsset(
  fileUrl: string
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()

    // Extract file path from URL
    const url = new URL(fileUrl)
    const pathMatch = url.pathname.match(/landing-page-assets\/(.+)$/)
    if (!pathMatch) {
      return { success: false, error: 'Invalid file URL' }
    }

    const filePath = decodeURIComponent(pathMatch[1])

    // Verify file belongs to this tenant
    if (!filePath.startsWith(`${tenantId}/`)) {
      return { success: false, error: 'Access denied' }
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.storage
      .from('landing-page-assets')
      .remove([filePath])

    if (error) throw error
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete image',
    }
  }
}
