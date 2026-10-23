import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ host: 'preciopana.com', proto: 'https' as string | null }))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => (k === 'host' ? state.host : k === 'x-forwarded-proto' ? state.proto : null),
  }),
}))

import { getTenantSiteUrl } from '@/lib/platform/tenant-site-url'
import { buildJoinUrl } from '@/lib/tenant/invitations'

describe('getTenantSiteUrl', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_DOMAIN', 'preciopana.com')
    state.host = 'preciopana.com'
    state.proto = 'https'
  })
  afterEach(() => vi.unstubAllEnvs())

  it('uses <slug>.<platform domain> when the school has no domain of its own', async () => {
    expect(await getTenantSiteUrl('test-school')).toBe('https://test-school.preciopana.com')
    expect(await getTenantSiteUrl('test-school', null)).toBe('https://test-school.preciopana.com')
    expect(await getTenantSiteUrl('test-school', '  ')).toBe('https://test-school.preciopana.com')
  })

  it('points at the school\'s own domain when it has one', async () => {
    expect(await getTenantSiteUrl('test-school', 'academia.guille.tech')).toBe('https://academia.guille.tech')
    expect(await getTenantSiteUrl('test-school', ' Academia.Guille.Tech ')).toBe('https://academia.guille.tech')
  })

  it('keeps the local port for slug subdomains', async () => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_DOMAIN', 'lvh.me')
    state.host = 'default.lvh.me:3005'
    expect(await getTenantSiteUrl('code-academy')).toBe('http://code-academy.lvh.me:3005')
  })
})

describe('buildJoinUrl', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_DOMAIN', 'preciopana.com')
    state.host = 'preciopana.com'
    state.proto = 'https'
  })
  afterEach(() => vi.unstubAllEnvs())

  it('links to the custom domain join page when there is one', async () => {
    expect(await buildJoinUrl('test-school', 'academia.guille.tech')).toBe('https://academia.guille.tech/join-school')
  })

  it('falls back to the slug subdomain', async () => {
    expect(await buildJoinUrl('test-school')).toBe('https://test-school.preciopana.com/join-school')
  })
})
