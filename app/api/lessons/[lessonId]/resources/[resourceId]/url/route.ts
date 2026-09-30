/**
 * A short-lived download URL for one lesson resource —
 * `GET /api/lessons/:lessonId/resources/:resourceId/url` (#848).
 *
 * The web opens resources through the `getResourceDownloadUrl` server action,
 * which a native client cannot call; the app could list a lesson's resources
 * but not open them (guillermoscript/lms-app#38). Both now go through
 * `signLessonResourceDownload`, so the gate is the same: resource in the
 * caller's school and in this lesson, and the caller is the course author, a
 * school admin, or has course access.
 *
 * Cookie or Bearer via `getApiAuthContext`; with Bearer the school is the
 * token's `tenant_id` claim. A resource in another school is a 404, not a 403.
 *
 * 200 `{ url, expiresIn, fileName, mimeType }` · 400 bad ids · 401 · 403
 * `access_denied` · 404 `not_found` · 500 `failed`.
 */
import { NextResponse } from 'next/server'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { signLessonResourceDownload } from '@/lib/lessons/resource-download'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

function positiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; resourceId: string }> }
) {
  const auth = await getApiAuthContext(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const raw = await params
  const lessonId = positiveInt(raw.lessonId)
  const resourceId = positiveInt(raw.resourceId)
  if (!lessonId || !resourceId) {
    return NextResponse.json({ error: 'Invalid lesson or resource id', code: 'invalid_id' }, { status: 400 })
  }

  const result = await signLessonResourceDownload(createAdminClient(), {
    tenantId: auth.tenantId,
    userId: auth.user.id,
    resourceId,
    lessonId,
  })

  if (result.ok) {
    const { url, expiresIn, fileName, mimeType } = result
    return NextResponse.json({ url, expiresIn, fileName, mimeType }, { headers: NO_STORE })
  }
  if (result.code === 'not_found') {
    return NextResponse.json({ error: 'Resource not found', code: 'not_found' }, { status: 404, headers: NO_STORE })
  }
  if (result.code === 'access_denied') {
    return NextResponse.json(
      { error: 'You do not have access to this course', code: 'access_denied' },
      { status: 403, headers: NO_STORE }
    )
  }
  return NextResponse.json({ error: 'Failed to get download URL', code: 'failed' }, { status: 500, headers: NO_STORE })
}
