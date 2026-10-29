import { afterEach, describe, expect, it, vi } from 'vitest'
import { challengeLinkResolves, challengeTokenFromPath } from '@/lib/challenges/proxy-guard'

const TENANT = 't1'

function mockDb(link: unknown, setting: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const rows = url.includes('/challenge_links')
        ? link ? [link] : []
        : setting === undefined ? [] : [{ setting_value: setting }]
      return { ok: true, status: 200, json: async () => rows }
    }),
  )
}
const resolves = () => challengeLinkResolves('abcdef123456', TENANT, 'http://db', 'key')

afterEach(() => vi.unstubAllGlobals())

describe('challengeTokenFromPath', () => {
  it.each([
    ['/reto/abcdef123456', 'abcdef123456'],
    ['/es/reto/abcdef123456', 'abcdef123456'],
    ['/en/reto/abc_DEF-123/', 'abc_DEF-123'],
    ['/reto/short', null],
    ['/es/reto/abcdef123456/extra', null],
    ['/es/courses/abcdef123456', null],
  ])('%s => %s', (path, want) => expect(challengeTokenFromPath(path)).toBe(want))
})

describe('challengeLinkResolves', () => {
  const link = { tenant_id: TENANT, active: true }
  it.each([[true], ['true'], [{ enabled: true }]])('resolves for enabled shape %j', async (shape) => {
    mockDb(link, shape)
    expect(await resolves()).toBe(true)
  })
  it('is false for an unknown link', async () => {
    mockDb(null, { enabled: true })
    expect(await resolves()).toBe(false)
  })
  it('is false for an inactive link', async () => {
    mockDb({ ...link, active: false }, { enabled: true })
    expect(await resolves()).toBe(false)
  })
  it('is false for another school’s link', async () => {
    mockDb({ ...link, tenant_id: 'other' }, { enabled: true })
    expect(await resolves()).toBe(false)
  })
  it.each([[undefined], [false], [{ enabled: false }]])('is false when challenges are off (%j)', async (shape) => {
    mockDb(link, shape)
    expect(await resolves()).toBe(false)
  })
  it('fails open on a lookup error so the page decides', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => [] })))
    expect(await resolves()).toBe(true)
  })
})
