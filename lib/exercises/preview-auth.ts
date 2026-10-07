import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { aiChatLimiter, AI_CHAT_TURNS_PER_MINUTE } from '@/lib/rate-limit'
import { checkAiChatUsage, aiChatRateLimitedResponse, aiChatUsageLimitResponse } from '@/lib/ai/chat-usage'

/**
 * Staff sandbox, authorized against current membership AND the course being edited.
 * `canConfigure` (school admin) shapes the typed AI error: admins get the settings link.
 */
export async function authorizeExercisePreview(req: Request, courseId: number) {
  const auth = await getApiAuthContext(req)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { supabase, user, tenantId } = auth
  const { data: membership } = await supabase.from('tenant_users').select('role')
    .eq('user_id', user.id).eq('tenant_id', tenantId).eq('status', 'active').maybeSingle()
  if (membership?.role !== 'teacher' && membership?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { data: course } = await supabase.from('courses').select('author_id')
    .eq('course_id', courseId).eq('tenant_id', tenantId).maybeSingle()
  if (!course || (membership.role !== 'admin' && course.author_id !== user.id)) {
    return Response.json({ error: 'Course not found' }, { status: 404 })
  }
  return { ...auth, canConfigure: membership.role === 'admin' }
}

export async function checkExercisePreviewBudget(auth: Exclude<Awaited<ReturnType<typeof authorizeExercisePreview>>, Response>) {
  try {
    await aiChatLimiter.check(AI_CHAT_TURNS_PER_MINUTE, auth.user.id)
  } catch {
    return aiChatRateLimitedResponse()
  }
  const usage = await checkAiChatUsage(auth.supabase, auth.tenantId, auth.user.id)
  return usage.allowed ? null : aiChatUsageLimitResponse(usage.reason)
}
