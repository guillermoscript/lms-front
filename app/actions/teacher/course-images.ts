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

export interface CourseLibraryImage {
  name: string
  url: string
  createdAt: string | null
}

const LIBRARY_LIMIT = 200

/**
 * Every image already in this school's folder of the `course-images` bucket —
 * direct uploads at the root plus AI-generated ones one folder down — newest
 * first, so teachers reuse an image instead of uploading it again.
 */
export async function listCourseImages(): Promise<
  { success: true; images: CourseLibraryImage[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const role = await getUserRole()
    if (role !== 'teacher' && role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const bucket = createAdminClient().storage.from('course-images')
    const listOpts = { limit: LIBRARY_LIMIT, sortBy: { column: 'created_at', order: 'desc' } as const }

    const { data: root, error } = await bucket.list(tenantId, listOpts)
    if (error) throw error

    const folders = (root ?? []).filter((e) => !e.id).slice(0, 10)
    const nested = await Promise.all(
      folders.map(async (f) => {
        const { data } = await bucket.list(`${tenantId}/${f.name}`, listOpts)
        return (data ?? []).filter((e) => e.id).map((e) => ({ ...e, path: `${tenantId}/${f.name}/${e.name}` }))
      })
    )
    const files = [
      ...(root ?? []).filter((e) => e.id).map((e) => ({ ...e, path: `${tenantId}/${e.name}` })),
      ...nested.flat(),
    ].filter((e) => /\.(jpe?g|png|gif|webp)$/i.test(e.name))

    const images = files
      .map((e) => ({
        name: e.name,
        url: bucket.getPublicUrl(e.path).data.publicUrl,
        createdAt: e.created_at ?? null,
      }))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, LIBRARY_LIMIT)

    return { success: true, images }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to list images',
    }
  }
}
