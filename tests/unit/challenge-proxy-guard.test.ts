import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyChallengePath,
  challengeLinkResolves,
  clearChallengeLookupCache,
  guardChallengePath,
} from '@/lib/challenges/proxy-guard'

const TENANT = 't1'

function mockDb(link: unknown, setting: unknown) {
  const fn = vi.fn(async (url: string) => {
    const rows = url.includes('/challenge_links')
      ? link ? [link] : []
      : setting === undefined ? [] : [{ setting_value: setting }]
    return { ok: true, status: 200, json: async () => rows }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
const resolves = () => challengeLinkResolves('abcdef123456', TENANT, 'http://db', 'key')

beforeEach(() => clearChallengeLookupCache())
afterEach(() => vi.unstubAllGlobals())

describe('classifyChallengePath', () => {
  it.each([
    ['/reto/abcdef123456', { kind: 'token', token: 'abcdef123456' }],
    ['/es/reto/abcdef123456', { kind: 'token', token: 'abcdef123456' }],
    ['/en/reto/abc_DEF-123/', { kind: 'token', token: 'abc_DEF-123' }],
    ['/reto/abc', { kind: 'malformed' }],
    ['/reto/abc%20def123456', { kind: 'malformed' }],
    ['/es/reto/abcdef123456/extra', { kind: 'malformed' }],
    ['/es/courses/abcdef123456', null],
    ['/es/reto', null],
  ])('%s', (path, want) => expect(classifyChallengePath(path)).toEqual(want))
})

describe('challengeLinkResolves', () => {
  const link = { tenant_id: TENANT, active: true }
  it.each([[true], ['true'], [{ enabled: true }]])('resolves for enabled shape %j', async (shape) => {
    mockDb(link, shape)
    expect(await resolves()).toBe(true)
  })
  it('is false for unknown, inactive and other-school links', async () => {
    mockDb(null, { enabled: true })
    expect(await resolves()).toBe(false)
    clearChallengeLookupCache()
    mockDb({ ...link, active: false }, { enabled: true })
    expect(await resolves()).toBe(false)
    clearChallengeLookupCache()
    mockDb({ ...link, tenant_id: 'other' }, { enabled: true })
    expect(await resolves()).toBe(false)
  })
  it.each([[undefined], [false], [{ enabled: false }], [{ enabled: 'true' }]])('is false when challenges are off (%j)', async (shape) => {
    mockDb(link, shape)
    expect(await resolves()).toBe(false)
  })
  it('caches the lookup (no second DB round trip)', async () => {
    const fn = mockDb(link, { enabled: true })
    await resolves()
    await resolves()
    expect(fn).toHaveBeenCalledTimes(2) // links + settings, once
  })
  it('fails open on an error and logs it without the key', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => [] })))
    expect(await resolves()).toBe(true)
    expect(err).toHaveBeenCalledOnce()
    expect(JSON.stringify(err.mock.calls)).not.toContain('key')
    err.mockRestore()
  })
  it('fails open on a timeout', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError') }))
    expect(await resolves()).toBe(true)
    err.mockRestore()
  })
})

describe('guardChallengePath (the proxy rewrite)', () => {
  const run = (pathname: string, headers: Record<string, string> = {}) => {
    const request = new NextRequest(`http://qa.lvh.me:3005${pathname}`, { headers })
    request.headers.set('x-tenant-id', TENANT)
    return guardChallengePath({
      request, pathname, tenantId: TENANT, locales: ['en', 'es'], defaultLocale: 'en', supabaseUrl: 'http://db', serviceKey: 'key',
    })
  }

  it('passes non-challenge paths and live links through', async () => {
    mockDb({ tenant_id: TENANT, active: true }, { enabled: true })
    expect(await run('/es/courses')).toBeNull()
    expect(await run('/es/reto/abcdef123456')).toBeNull()
  })

  it('dead link: 404 rewrite to the not-found route, keeping the locale and the tenant header', async () => {
    mockDb(null, { enabled: true })
    const res = await run('/es/reto/abcdef123456')
    expect(res?.status).toBe(404)
    expect(res?.headers.get('x-middleware-rewrite')).toBe('http://qa.lvh.me:3005/es/reto-not-found')
    // The request headers the rewrite forwards carry the tenant id.
    expect(res?.headers.get('x-middleware-override-headers')).toContain('x-tenant-id')
    expect(res?.headers.get('x-middleware-request-x-tenant-id')).toBe(TENANT)
  })

  it('no locale prefix falls back to the default locale', async () => {
    mockDb(null, { enabled: true })
    const res = await run('/reto/abcdef123456')
    expect(res?.headers.get('x-middleware-rewrite')).toBe('http://qa.lvh.me:3005/en/reto-not-found')
  })

  it('malformed tokens and extra segments 404 with NO database call', async () => {
    const fn = mockDb(null, undefined)
    for (const p of ['/es/reto/abc', '/en/reto/abcdef123456/x']) {
      expect((await run(p))?.status).toBe(404)
    }
    expect(fn).not.toHaveBeenCalled()
  })
})
