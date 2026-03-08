import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

const STORAGE_BUCKET = 'exercise-media'

export async function POST(req: Request) {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const tenantId = await getCurrentTenantId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  let submissionId: number
  try {
    const body = await req.json()
    submissionId = parseInt(body.submissionId)
    if (isNaN(submissionId) || submissionId <= 0) throw new Error('invalid')
  } catch {
    return new Response('submissionId is required', { status: 400 })
  }

  const { data: submission, error } = await adminClient
    .from('exercise_media_submissions')
    .select('media_url, user_id, tenant_id')
    .eq('id', submissionId)
    .single()

  if (error || !submission) {
    return new Response('Submission not found', { status: 404 })
  }

  if (submission.user_id !== user.id || submission.tenant_id !== tenantId) {
    return new Response('Submission not found', { status: 404 })
  }

  const { data: urlData } = await adminClient
    .storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(submission.media_url, 600)

  if (!urlData?.signedUrl) {
    return new Response('Could not generate signed URL', { status: 500 })
  }

  return Response.json({ signedUrl: urlData.signedUrl })
}
