import { describe, expect, it } from 'vitest'
import {
  PROTECTED_PREFIXES,
  isProtectedPath,
  joinSchoolPath,
  localizePath,
  loginPath,
} from '@/lib/auth/route-access'

/**
 * #728 inverted the proxy's route rule: it used to allow-list public routes and
 * treat everything else as protected, which turned a typo'd URL into a login
 * wall instead of a 404 and silently protected every new public page that
 * forgot to add itself to the list. These cases pin the replacement — above all
 * that nothing under a protected prefix slips out of it.
 */
describe('isProtectedPath', () => {
  it('protects each prefix and everything nested under it', () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect(isProtectedPath(prefix)).toBe(true)
      expect(isProtectedPath(`${prefix}/`)).toBe(true)
      expect(isProtectedPath(`${prefix}/anything/deeper`)).toBe(true)
    }
  })

  it('keeps the guarded areas guarded', () => {
    expect(isProtectedPath('/dashboard/student')).toBe(true)
    expect(isProtectedPath('/dashboard/admin/revenue')).toBe(true)
    expect(isProtectedPath('/platform/tenants')).toBe(true)
    expect(isProtectedPath('/checkout?courseId=42')).toBe(true)
    expect(isProtectedPath('/onboarding')).toBe(true)
    expect(isProtectedPath('/join-school?next=%2Fproducts%2F1')).toBe(true)
  })

  it('leaves public pages public', () => {
    for (const path of [
      '/',
      '/courses',
      '/courses/12',
      '/products/1',
      '/pricing',
      '/platform-pricing',
      '/creators',
      '/about',
      '/verify/abc',
      '/auth/login',
      '/auth/sign-up',
      '/auth/confirm',
      '/oauth/consent',
      '/create-school',
      '/p/some-landing-page',
    ]) {
      expect(isProtectedPath(path), path).toBe(false)
    }
  })

  it('treats an unknown path as public, so it can reach not-found', () => {
    expect(isProtectedPath('/esta-pagina-no-existe')).toBe(false)
    expect(isProtectedPath('/typo/deeper')).toBe(false)
  })

  it('does not let a lookalike prefix escape the guard, or a sibling fall into it', () => {
    // A different segment that merely starts with the same letters is its own route.
    expect(isProtectedPath('/dashboards')).toBe(false)
    expect(isProtectedPath('/platform-pricing')).toBe(false)
    expect(isProtectedPath('/checkout-help')).toBe(false)
    // But the real prefix with a query or hash is still protected.
    expect(isProtectedPath('/dashboard#section')).toBe(true)
    expect(isProtectedPath('/platform?tab=1')).toBe(true)
  })
})

describe('localizePath', () => {
  it('adds the locale only when the path lacks one', () => {
    expect(localizePath('/products/1', 'es')).toBe('/es/products/1')
    expect(localizePath('/es/products/1', 'es')).toBe('/es/products/1')
    expect(localizePath('/en/products/1', 'es')).toBe('/en/products/1')
  })

  it('is not fooled by a segment that merely starts with a locale', () => {
    expect(localizePath('/entrenamiento', 'es')).toBe('/es/entrenamiento')
    expect(localizePath('/español', 'en')).toBe('/en/español')
  })
})

describe('loginPath', () => {
  it('encodes the destination', () => {
    expect(loginPath('/checkout?courseId=42')).toBe(
      '/auth/login?next=%2Fcheckout%3FcourseId%3D42'
    )
  })
})

describe('joinSchoolPath', () => {
  it('carries a safe destination', () => {
    expect(joinSchoolPath('/products/1')).toBe('/join-school?next=%2Fproducts%2F1')
  })

  it('drops an off-origin or malformed destination instead of forwarding it', () => {
    for (const hostile of [
      'https://evil.example.com',
      '//evil.example.com',
      '/\\evil.example.com',
      '\\\\evil.example.com',
      'javascript:alert(1)',
    ]) {
      expect(joinSchoolPath(hostile), hostile).toBe('/join-school')
    }
  })

  it('returns a bare join path when there is nothing to carry', () => {
    expect(joinSchoolPath(null)).toBe('/join-school')
    expect(joinSchoolPath(undefined)).toBe('/join-school')
    expect(joinSchoolPath('')).toBe('/join-school')
  })

  it('does not wrap the join page in itself', () => {
    expect(joinSchoolPath('/join-school')).toBe('/join-school')
    expect(joinSchoolPath('/join-school?next=%2Fproducts%2F1')).toBe(
      '/join-school?next=%2Fproducts%2F1'
    )
  })
})
