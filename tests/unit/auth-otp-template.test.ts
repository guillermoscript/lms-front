import { describe, expect, it } from 'vitest'
import { deriveBrandOutputs } from '@/lib/themes/brand-outputs'
import type { SchoolBrand } from '@/lib/themes/school-brand'
import { authOtpTemplate, resolveAuthOtpLocale, type AuthOtpKind } from '@/lib/email/templates/auth-otp'

/**
 * `authOtpTemplate` (issue #776) is what `app/api/auth/send-email-hook/route.ts`
 * renders for every Supabase Auth email this app takes over from GoTrue's
 * defaults. Brand rendering itself (button/heading colours, no hardcoded blue,
 * no leaked oklch()) is asserted once for all school-branded templates in
 * `tests/unit/email-school-brand.test.ts` — this file covers what's specific
 * to auth OTP emails: every kind renders, locale switches the copy, and the
 * link/school name are escaped.
 */

function brandFor(theme: 'andina' | 'kodigo' | null, brandHex: string, name = 'Test School'): SchoolBrand {
  const stored = theme ? { type: 'kit' as const, theme, brand: brandHex } : null
  return { tenantId: 'tenant-1', name, logoUrl: null, theme: stored, outputs: deriveBrandOutputs(stored) }
}

const BRAND = brandFor('andina', '#2F6B4F')
const ACTION_URL = 'https://acme.lvh.me:3005/auth/confirm?token_hash=abc123&type=signup&next=%2F'

const KINDS: AuthOtpKind[] = ['signup', 'magiclink', 'recovery', 'invite', 'email_change_new', 'email_change_current']

describe('resolveAuthOtpLocale', () => {
  it('picks es for anything starting with es', () => {
    expect(resolveAuthOtpLocale('es')).toBe('es')
    expect(resolveAuthOtpLocale('es-419')).toBe('es')
    expect(resolveAuthOtpLocale('ES')).toBe('es')
  })

  it('defaults to en for anything else, including null/undefined', () => {
    expect(resolveAuthOtpLocale('en')).toBe('en')
    expect(resolveAuthOtpLocale('fr')).toBe('en')
    expect(resolveAuthOtpLocale(null)).toBe('en')
    expect(resolveAuthOtpLocale(undefined)).toBe('en')
  })
})

describe('authOtpTemplate', () => {
  it.each(KINDS)('renders a non-empty subject and html for kind=%s', (kind) => {
    const { subject, html } = authOtpTemplate({ kind, schoolName: BRAND.name, actionUrl: ACTION_URL, locale: 'en', brand: BRAND })
    expect(subject.length).toBeGreaterThan(0)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain(BRAND.name)
  })

  it.each(KINDS)('carries the action link as the button href for kind=%s', (kind) => {
    const { html } = authOtpTemplate({ kind, schoolName: BRAND.name, actionUrl: ACTION_URL, locale: 'en', brand: BRAND })
    expect(html).toContain(`href="${ACTION_URL}"`)
  })

  it('renders English copy by default', () => {
    const { subject } = authOtpTemplate({ kind: 'recovery', schoolName: 'Acme', actionUrl: ACTION_URL, locale: 'en', brand: BRAND })
    expect(subject).toBe('Reset your password for Acme')
  })

  it('renders Spanish copy when locale is es', () => {
    const { subject } = authOtpTemplate({ kind: 'recovery', schoolName: 'Acme', actionUrl: ACTION_URL, locale: 'es', brand: BRAND })
    expect(subject).toBe('Restablece tu contraseña de Acme')
  })

  it('falls back to English for an unrecognised locale', () => {
    const { subject } = authOtpTemplate({ kind: 'magiclink', schoolName: 'Acme', actionUrl: ACTION_URL, locale: 'fr', brand: BRAND })
    expect(subject).toContain('sign-in link')
  })

  it('HTML-escapes a school name containing markup', () => {
    const evilBrand = brandFor('andina', '#2F6B4F', '<b>Evil</b> School')
    const { html } = authOtpTemplate({ kind: 'signup', schoolName: evilBrand.name, actionUrl: ACTION_URL, locale: 'en', brand: evilBrand })
    expect(html).not.toContain('<b>Evil</b>')
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;')
  })

  it('email_change_new and email_change_current render distinct copy', () => {
    const toNew = authOtpTemplate({ kind: 'email_change_new', schoolName: 'Acme', actionUrl: ACTION_URL, locale: 'en', brand: BRAND })
    const toCurrent = authOtpTemplate({ kind: 'email_change_current', schoolName: 'Acme', actionUrl: ACTION_URL, locale: 'en', brand: BRAND })
    expect(toNew.subject).not.toBe(toCurrent.subject)
    expect(toNew.html).toContain('Confirm your new email')
    expect(toCurrent.html).toContain('Confirm your email change')
  })
})
