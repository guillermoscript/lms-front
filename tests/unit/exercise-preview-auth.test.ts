import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  signedIn: true, role: 'teacher', author: 'teacher', tenant: 'school',
  filters: [] as [string, string, unknown][], limited: false,
}))
vi.mock('@/lib/supabase/api-auth', () => ({ getApiAuthContext: async () => state.signedIn ? {
  user: { id: 'teacher' }, tenantId: state.tenant,
  supabase: { from: (table: string) => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { state.filters.push([table, key, value]); return query },
      maybeSingle: async () => ({ data: table === 'tenant_users' ? { role: state.role } : { author_id: state.author } }),
    }; return query
  } },
} : null }))
vi.mock('@/lib/rate-limit', () => ({ AI_CHAT_TURNS_PER_MINUTE: 10, aiChatLimiter: { check: async () => { if (state.limited) throw new Error('limited') } } }))
vi.mock('@/lib/ai/chat-usage', () => ({
  checkAiChatUsage: async () => ({ allowed: true }),
  aiChatRateLimitedResponse: () => new Response('', { status: 429 }),
  aiChatUsageLimitResponse: () => new Response('', { status: 429 }),
}))
import { authorizeExercisePreview, checkExercisePreviewBudget } from '@/lib/exercises/preview-auth'
const req = new Request('http://localhost/preview')
beforeEach(() => { state.signedIn = true; state.role = 'teacher'; state.author = 'teacher'; state.tenant = 'school'; state.filters = []; state.limited = false })
describe('teacher preview authorization', () => {
  it('requires a verified signed-in user', async () => {
    state.signedIn = false
    expect((await authorizeExercisePreview(req, 2) as Response).status).toBe(401)
  })
  it('denies students even if they claim an arbitrary draft or course', async () => {
    state.role = 'student'
    expect((await authorizeExercisePreview(req, 2) as Response).status).toBe(403)
    expect(state.filters.some(([table]) => table === 'courses')).toBe(false)
  })
  it('checks active per-tenant membership and same-tenant course ownership', async () => {
    const auth = await authorizeExercisePreview(req, 2)
    expect(auth).not.toBeInstanceOf(Response)
    expect(state.filters).toContainEqual(['tenant_users', 'status', 'active'])
    expect(state.filters).toContainEqual(['tenant_users', 'tenant_id', 'school'])
    expect(state.filters).toContainEqual(['courses', 'tenant_id', 'school'])
    expect(state.filters).toContainEqual(['courses', 'course_id', 2])
  })
  it('denies a teacher another author’s course but permits school admins', async () => {
    state.author = 'another-teacher'
    expect((await authorizeExercisePreview(req, 2) as Response).status).toBe(404)
    state.role = 'admin'
    expect(await authorizeExercisePreview(req, 2)).not.toBeInstanceOf(Response)
  })
  it('applies the burst limit', async () => {
    const auth = await authorizeExercisePreview(req, 2)
    if (auth instanceof Response) throw new Error('unexpected denial')
    state.limited = true
    expect((await checkExercisePreviewBudget(auth))?.status).toBe(429)
  })
})
