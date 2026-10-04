import { describe, expect, it } from 'vitest'
import { buildAuthEmailLink } from '@/lib/auth/send-email-hook/build-link'

/**
 * `buildAuthEmailLink` (issue #776) always points at THIS app's own
 * `/auth/confirm` route (which calls `supabase.auth.verifyOtp({ type, token_hash })`
 * itself) rather than Supabase's hosted `/auth/v1/verify` — see
 * `app/[locale]/auth/confirm/route.ts`. It reads the tenant subdomain and the
 * post-verification destination from `redirect_to`, never from `site_url`
 * (the project's single global Site URL setting).
 */
describe('buildAuthEmailLink', () => {
  it('recovers the tenant origin and unwraps `next` when redirect_to already targets /auth/confirm (sign-up flow)', () => {
    const link = buildAuthEmailLink({
      siteUrl: 'https://lmsplatform.com',
      redirectTo: 'https://acme.lvh.me:3005/auth/confirm?next=%2Fcreate-school',
      tokenHash: 'th_abc',
      type: 'signup',
    })

    const url = new URL(link.url)
    expect(url.origin).toBe('https://acme.lvh.me:3005')
    expect(url.pathname).toBe('/auth/confirm')
    expect(url.searchParams.get('token_hash')).toBe('th_abc')
    expect(url.searchParams.get('type')).toBe('signup')
    expect(url.searchParams.get('next')).toBe('/create-school')
  })

  it('uses the full path+query as `next` when redirect_to targets a different page (password reset)', () => {
    const link = buildAuthEmailLink({
      siteUrl: 'https://lmsplatform.com',
      redirectTo: 'https://acme.lvh.me:3005/auth/update-password',
      tokenHash: 'th_recovery',
      type: 'recovery',
    })

    const url = new URL(link.url)
    expect(url.origin).toBe('https://acme.lvh.me:3005')
    expect(url.searchParams.get('next')).toBe('/auth/update-password')
    expect(url.searchParams.get('type')).toBe('recovery')
  })

  it('falls back to site_url and "/" when redirect_to is missing', () => {
    const link = buildAuthEmailLink({
      siteUrl: 'https://lmsplatform.com',
      redirectTo: null,
      tokenHash: 'th_x',
      type: 'magiclink',
    })

    const url = new URL(link.url)
    expect(url.origin).toBe('https://lmsplatform.com')
    expect(url.searchParams.get('next')).toBe('/')
  })

  it('falls back to site_url and "/" when redirect_to is malformed', () => {
    const link = buildAuthEmailLink({
      siteUrl: 'https://lmsplatform.com',
      redirectTo: 'not a url',
      tokenHash: 'th_x',
      type: 'magiclink',
    })

    const url = new URL(link.url)
    expect(url.origin).toBe('https://lmsplatform.com')
    expect(url.searchParams.get('next')).toBe('/')
  })

  it('rejects an unsafe `next` (protocol-relative) recovered from redirect_to', () => {
    const link = buildAuthEmailLink({
      siteUrl: 'https://lmsplatform.com',
      redirectTo: 'https://acme.lvh.me:3005/auth/confirm?next=%2F%2Fevil.example.com',
      tokenHash: 'th_abc',
      type: 'signup',
    })

    expect(new URL(link.url).searchParams.get('next')).toBe('/')
  })

  it('picks up a locale prefix from redirect_to path', () => {
    const link = buildAuthEmailLink({
      siteUrl: 'https://lmsplatform.com',
      redirectTo: 'https://acme.lvh.me:3005/es/auth/update-password',
      tokenHash: 'th_x',
      type: 'recovery',
    })

    expect(link.locale).toBe('es')
  })

  it('reports no locale when redirect_to carries none', () => {
    const link = buildAuthEmailLink({
      siteUrl: 'https://lmsplatform.com',
      redirectTo: 'https://acme.lvh.me:3005/auth/update-password',
      tokenHash: 'th_x',
      type: 'recovery',
    })

    expect(link.locale).toBeNull()
  })
})
