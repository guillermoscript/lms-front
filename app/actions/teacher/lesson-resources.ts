'use server'

import { createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { nanoid } from 'nanoid'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

async function verifyLessonOwnership(lessonId: number) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const role = await getUserRole()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, course_id, courses(author_id)')
    .eq('id', lessonId)
    .eq('tenant_id', tenantId)
    .single()

  if (!lesson) throw new Error('Lesson not found')

  const course = lesson.courses as any
  const isOwner = course?.author_id === user.id
  const isAdmin = role === 'admin'

  if (!isOwner && !isAdmin) {
    throw new Error('Access denied')
  }

  return { user, tenantId }
}

export async function uploadLessonResource(
  lessonId: number,
  formData: FormData
): Promise<ActionResult<{ id: number; file_name: string; file_size: number; mime_type: string }>> {
  try {
    const { user, tenantId } = await verifyLessonOwnership(lessonId)
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'File size must be under 10MB' }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { success: false, error: 'File type not allowed' }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const storagePath = `${tenantId}/${lessonId}/${nanoid()}.${ext}`

    const adminClient = createAdminClient()

    const { error: uploadError } = await adminClient.storage
      .from('lesson-resources')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) throw uploadError

    // Get current max display_order
    const { data: existing } = await adminClient
      .from('lesson_resources')
      .select('display_order')
      .eq('lesson_id', lessonId)
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = (existing?.[0]?.display_order ?? -1) + 1

    const { data: resource, error: insertError } = await adminClient
      .from('lesson_resources')
      .insert({
        lesson_id: lessonId,
        tenant_id: tenantId,
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id,
        display_order: nextOrder,
      })
      .select('id, file_name, file_size, mime_type')
      .single()

    if (insertError) throw insertError

    return { success: true, data: resource }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to upload resource',
    }
  }
}

export async function deleteLessonResource(
  resourceId: number
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const adminClient = createAdminClient()

    // Fetch resource and verify ownership
    const { data: resource } = await adminClient
      .from('lesson_resources')
      .select('id, file_path, lesson_id, tenant_id, lessons(course_id, courses(author_id))')
      .eq('id', resourceId)
      .single()

    if (!resource || resource.tenant_id !== tenantId) {
      return { success: false, error: 'Resource not found' }
    }

    const course = (resource.lessons as any)?.courses as any
    const isOwner = course?.author_id === user.id
    const isAdmin = role === 'admin'

    if (!isOwner && !isAdmin) {
      return { success: false, error: 'Access denied' }
    }

    // Remove from storage
    await adminClient.storage
      .from('lesson-resources')
      .remove([resource.file_path])

    // Remove from DB
    const { error } = await adminClient
      .from('lesson_resources')
      .delete()
      .eq('id', resourceId)

    if (error) throw error

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete resource',
    }
  }
}

export async function reorderLessonResources(
  lessonId: number,
  orderedIds: number[]
): Promise<ActionResult> {
  try {
    await verifyLessonOwnership(lessonId)

    const adminClient = createAdminClient()

    // Update display_order for each resource
    const updates = orderedIds.map((id, index) =>
      adminClient
        .from('lesson_resources')
        .update({ display_order: index })
        .eq('id', id)
        .eq('lesson_id', lessonId)
    )

    await Promise.all(updates)

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to reorder resources',
    }
  }
}

export async function getResourceDownloadUrl(
  resourceId: number
): Promise<ActionResult<{ url: string }>> {
  try {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const adminClient = createAdminClient()

    const { data: resource } = await adminClient
      .from('lesson_resources')
      .select('id, file_path, lesson_id, tenant_id, lessons(course_id, courses(author_id))')
      .eq('id', resourceId)
      .single()

    if (!resource || resource.tenant_id !== tenantId) {
      return { success: false, error: 'Resource not found' }
    }

    // Check: is user the author, admin, or enrolled?
    const role = await getUserRole()
    const course = (resource.lessons as any)?.courses as any
    const isOwner = course?.author_id === user.id
    const isAdmin = role === 'admin'

    if (!isOwner && !isAdmin) {
      // Check enrollment
      const courseId = (resource.lessons as any)?.course_id
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('enrollment_id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .limit(1)

      // Also verify course access through product_courses
      const { data: access } = await adminClient
        .from('product_courses')
        .select('product_id, enrollments!inner(enrollment_id)')
        .eq('course_id', courseId)
        .eq('enrollments.user_id', user.id)
        .eq('enrollments.status', 'active')
        .limit(1)

      if (!access?.length) {
        return { success: false, error: 'Access denied' }
      }
    }

    const { data: signedUrl, error } = await adminClient.storage
      .from('lesson-resources')
      .createSignedUrl(resource.file_path, 3600) // 1 hour

    if (error) throw error

    return { success: true, data: { url: signedUrl.signedUrl } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get download URL',
    }
  }
}

export async function toggleSequentialCompletion(
  courseId: number,
  enabled: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: course } = await supabase
      .from('courses')
      .select('course_id, author_id')
      .eq('course_id', courseId)
      .eq('tenant_id', tenantId)
      .single()

    if (!course) return { success: false, error: 'Course not found' }

    const isOwner = course.author_id === user.id
    const isAdmin = role === 'admin'

    if (!isOwner && !isAdmin) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabase
      .from('courses')
      .update({ require_sequential_completion: enabled })
      .eq('course_id', courseId)

    if (error) throw error

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update setting',
    }
  }
}
