import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const state = vi.hoisted(() => ({
  userId: 'verified-user' as string | null, updateSession: vi.fn(),
  member: true, queryError: false, filters: [] as [string, unknown][],
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ from: () => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { state.filters.push([key, value]); return query },
      maybeSingle: async () => ({ data: state.member ? { id: 'membership' } : null, error: state.queryError ? { message: 'offline' } : null }),
    }
    return query
  } }),
}))
vi.mock('@/lib/supabase/proxy', () => ({
  updateSession: async (request: NextRequest) => {
    state.updateSession(request)
    const response = NextResponse.next({ request })
    response.cookies.set('sb-test-auth-token', 'refreshed', { path: '/' })
    return { response, user: state.userId ? { id: state.userId } : null }
  },
}))
vi.mock('next-intl/middleware', () => ({ default: () => () => NextResponse.next() }))
vi.mock('@/i18n', () => ({ locales: ['en', 'es'], defaultLocale: 'en' }))

import proxy from '@/proxy'

beforeEach(() => {
  state.userId = 'verified-user'
  state.updateSession.mockClear()
  state.member = true
  state.queryError = false
  state.filters = []
})

describe('community background read authentication', () => {
  it.each(['new-posts', 'blocked-members'])('forwards verified identity for %s, replacing a spoofed header', async (path) => {
    const request = new NextRequest(`http://localhost:3000/api/community/${path}`, {
      headers: { host: 'localhost:3000', 'x-user-id': 'spoofed-user' },
    })
    const response = await proxy(request)
    expect(state.updateSession).toHaveBeenCalledOnce()
    expect(response.headers.get('x-middleware-request-x-user-id')).toBe('verified-user')
    expect(response.headers.get('x-middleware-request-x-tenant-id')).toBe('00000000-0000-0000-0000-000000000001')
    expect(response.cookies.get('sb-test-auth-token')?.value).toBe('refreshed')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(state.filters).toEqual([
      ['user_id', 'verified-user'], ['tenant_id', '00000000-0000-0000-0000-000000000001'], ['status', 'active'],
    ])
  })

  it.each(['new-posts', 'blocked-members'])('rejects %s without a verified session even with a user header', async (path) => {
    state.userId = null
    const request = new NextRequest(`http://localhost:3000/api/community/${path}`, {
      headers: { host: 'localhost:3000', 'x-user-id': 'spoofed-user' },
    })
    const response = await proxy(request)
    expect(response.status).toBe(401)
    expect(request.headers.get('x-user-id')).toBeNull()
    expect(await response.json()).toEqual({ success: false, error: 'Not authenticated' })
  })

  it.each(['new-posts', 'blocked-members'])('denies %s to users without an active school membership', async (path) => {
    state.member = false
    const response = await proxy(new NextRequest(`http://localhost:3000/api/community/${path}`, {
      headers: { host: 'localhost:3000' },
    }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ success: false, error: 'Access denied' })
  })

  it('fails closed when membership cannot be checked', async () => {
    state.queryError = true
    const response = await proxy(new NextRequest('http://localhost:3000/api/community/new-posts', {
      headers: { host: 'localhost:3000' },
    }))
    expect(response.status).toBe(403)
  })
})
