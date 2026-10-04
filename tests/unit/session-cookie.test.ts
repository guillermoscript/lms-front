import { describe, expect, it } from 'vitest'
import { accessTokenFromCookies, jwtClaims, rawSessionCookie } from '@/lib/supabase/session-cookie'

function base64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}

function fakeJwt(claims: Record<string, unknown>): string {
  return `${base64url('{"alg":"HS256"}')}.${base64url(JSON.stringify(claims))}.sig`
}

const TENANT = '00000000-0000-0000-0000-000000000300'
const token = fakeJwt({ sub: 'u1', tenant_id: TENANT, tenant_role: 'student', user_metadata: { full_name: 'Guillermo Marín' } })
const session = JSON.stringify({ access_token: token, refresh_token: 'r', user: { user_metadata: { full_name: 'Guillermo Marín' } } })

describe('accessTokenFromCookies', () => {
  it('reads the base64-prefixed cookie @supabase/ssr writes by default', () => {
    const cookies = [{ name: 'sb-abc-auth-token', value: `base64-${base64url(session)}` }]
    expect(accessTokenFromCookies(cookies)).toBe(token)
  })

  it('still reads a legacy plain-JSON cookie', () => {
    expect(accessTokenFromCookies([{ name: 'sb-abc-auth-token', value: session }])).toBe(token)
  })

  it('reassembles chunked cookies in numeric order, so .10 follows .9', () => {
    const encoded = `base64-${base64url(session)}`
    const size = Math.ceil(encoded.length / 11)
    const chunks = Array.from({ length: 11 }, (_, i) => ({
      name: `sb-abc-auth-token.${i}`,
      value: encoded.slice(i * size, (i + 1) * size),
    })).reverse() // arrival order must not matter
    expect(rawSessionCookie(chunks)).toBe(encoded)
    expect(accessTokenFromCookies(chunks)).toBe(token)
  })

  it('returns null rather than throwing on garbage', () => {
    expect(accessTokenFromCookies([])).toBeNull()
    expect(accessTokenFromCookies([{ name: 'sb-abc-auth-token', value: 'base64-!!!' }])).toBeNull()
    expect(accessTokenFromCookies([{ name: 'sb-abc-auth-token', value: '{"nope":1}' }])).toBeNull()
    expect(accessTokenFromCookies([{ name: 'other', value: session }])).toBeNull()
  })
})

describe('jwtClaims', () => {
  it('decodes the payload including non-ASCII metadata', () => {
    const claims = jwtClaims(token)
    expect(claims?.tenant_id).toBe(TENANT)
    expect(claims?.tenant_role).toBe('student')
    expect((claims?.user_metadata as { full_name: string }).full_name).toBe('Guillermo Marín')
  })

  it('returns null for a malformed token', () => {
    expect(jwtClaims('not-a-jwt')).toBeNull()
    expect(jwtClaims('a.%%%.c')).toBeNull()
  })
})
