import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  fullName: 'Ada Student' as string | null,
  profileError: false,
  issued: null as Record<string, unknown> | null,
}))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: async () => 'tenant-1' }))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: async () => true }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'student-1', email: 'student@example.com' } }, error: null }) },
    rpc: async () => ({ data: { success: true, eligible: true, completion: {} }, error: null }),
    from: (table: string) => {
      let selection = ''
      const result = () => {
        if (table === 'profiles') {
          if (selection.includes('email') || state.profileError) return { data: null, error: { message: 'Profile query failed' } }
          return { data: { full_name: state.fullName }, error: null }
        }
        if (table === 'courses') return { data: { course_id: 7, title: 'Learning Basics' }, error: null }
        if (table === 'enrollments') return { data: { enrollment_id: 1 }, error: null }
        if (table === 'certificates' && state.issued) return { data: { certificate_id: 'cert-1', ...state.issued }, error: null }
        return { data: null, error: null }
      }
      const query = {
        select: (columns = '*') => { selection = columns; return query },
        eq: () => query, is: () => query, limit: () => query,
        single: async () => result(), maybeSingle: async () => result(),
        insert: (payload: Record<string, unknown>) => { state.issued = payload; return query },
      }
      return query
    },
  }),
}))

import { POST } from '@/app/api/certificates/generate/route'

beforeEach(() => { state.fullName = 'Ada Student'; state.profileError = false; state.issued = null })

async function generate() {
  return POST(new NextRequest('http://localhost/api/certificates/generate', {
    method: 'POST', body: JSON.stringify({ courseId: 7 }), headers: { 'Content-Type': 'application/json' },
  }))
}

describe('certificate recipient name', () => {
  it('uses the saved profile name, without querying a nonexistent email column', async () => {
    const response = await generate()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.certificate.credential_json.credentialSubject.name).toBe('Ada Student')
  })
  it('uses authenticated email only when the saved name is empty', async () => {
    state.fullName = null
    const response = await generate()
    expect((await response.json()).certificate.credential_json.credentialSubject.name).toBe('student@example.com')
  })
  it('does not issue a certificate when the profile read fails', async () => {
    state.profileError = true
    expect((await generate()).status).toBe(500)
    expect(state.issued).toBeNull()
  })
})
