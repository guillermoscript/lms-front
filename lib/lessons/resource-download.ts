/**
 * Sign a lesson resource for download (#848) — the one gate both the web
 * action (`getResourceDownloadUrl`) and the native app's
 * `GET /api/lessons/:lessonId/resources/:resourceId/url` go through.
 *
 * Files live in the private `lesson-resources` bucket and are signed with the
 * service role, so this function IS the access check: the resource must belong
 * to `tenantId` (and to `lessonId`, when the caller names one), and the caller
 * must be the course's author, an active admin of the school, or hold course
 * access (`has_course_access` — entitlement + the school's access cutoff).
 * Anything else looks like a missing resource or a refusal, never a URL.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasCourseAccess } from '@/lib/services/course-access'

/** Seconds a signed URL stays valid. Callers open it right away. */
export const RESOURCE_URL_TTL_SECONDS = 300

export type ResourceDownloadResult =
  | { ok: true; url: string; expiresIn: number; fileName: string; mimeType: string | null }
  | { ok: false; code: 'not_found' | 'access_denied' | 'failed' }

interface ResourceRow {
  id: number
  file_path: string
  file_name: string
  mime_type: string | null
  lesson_id: number
  tenant_id: string
  lessons: { course_id: number; courses: { author_id: string | null } | null } | null
}

export async function signLessonResourceDownload(
  admin: SupabaseClient,
  {
    tenantId,
    userId,
    resourceId,
    lessonId,
  }: { tenantId: string; userId: string; resourceId: number; lessonId?: number }
): Promise<ResourceDownloadResult> {
  const { data, error } = await admin
    .from('lesson_resources')
    .select('id, file_path, file_name, mime_type, lesson_id, tenant_id, lessons(course_id, courses(author_id))')
    .eq('id', resourceId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('Lesson resource lookup failed:', error)
    return { ok: false, code: 'failed' }
  }

  const resource = data as unknown as ResourceRow | null
  // Belt and braces on the tenant: the filter above already scopes it.
  if (!resource || resource.tenant_id !== tenantId) return { ok: false, code: 'not_found' }
  if (lessonId !== undefined && resource.lesson_id !== lessonId) return { ok: false, code: 'not_found' }

  const courseId = resource.lessons?.course_id
  if (!courseId) return { ok: false, code: 'not_found' }

  if (!(await canDownload(admin, { tenantId, userId, courseId, authorId: resource.lessons?.courses?.author_id }))) {
    return { ok: false, code: 'access_denied' }
  }

  const { data: signed, error: signError } = await admin.storage
    .from('lesson-resources')
    .createSignedUrl(resource.file_path, RESOURCE_URL_TTL_SECONDS)
  if (signError || !signed?.signedUrl) {
    console.error('Lesson resource signing failed:', signError)
    return { ok: false, code: 'failed' }
  }

  return {
    ok: true,
    url: signed.signedUrl,
    expiresIn: RESOURCE_URL_TTL_SECONDS,
    fileName: resource.file_name,
    mimeType: resource.mime_type,
  }
}

async function canDownload(
  admin: SupabaseClient,
  {
    tenantId,
    userId,
    courseId,
    authorId,
  }: { tenantId: string; userId: string; courseId: number; authorId: string | null | undefined }
): Promise<boolean> {
  if (authorId && authorId === userId) return true

  // `tenant_users` is authoritative for the role (CLAUDE.md), not a JWT claim.
  const { data: adminMembership } = await admin
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'admin')
    .maybeSingle()
  if (adminMembership) return true

  return hasCourseAccess(admin, userId, courseId)
}
