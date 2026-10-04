/**
 * Unknown URLs reach not-found, protected URLs still reach the login wall (#728).
 *
 * `proxy.ts` used to allow-list the public routes and treat everything else as
 * protected. Two things followed: a typo'd URL sent a logged-out visitor to
 * login (and a logged-in one to `/join-school`) instead of showing a 404, and
 * every new public page had to remember to add itself to the list or silently
 * became login-walled — which is exactly how `/products` broke in #719.
 *
 * The rule is now inverted: a small closed list of protected prefixes, with
 * everything else public. That is a security-shaped change, so these cases pin
 * both halves — the new 404 behaviour AND the guards that must not have moved.
 * `auth-security.spec.ts` and `tenant-isolation.spec.ts` cover the rest.
 */
import { test, expect } from '@playwright/test'
import { BASE, TENANT_BASE, LOCALE } from './utils/constants'
import { loginAsStudent } from './utils/auth'

const UNKNOWN_PATHS = ['/esta-pagina-no-existe', '/typo/deeper/still-nothing']

test.describe('unknown paths', () => {
  for (const path of UNKNOWN_PATHS) {
    test(`logged out, ${path} renders not-found instead of the login wall`, async ({ page }) => {
      const response = await page.goto(`${TENANT_BASE}/${LOCALE}${path}`)

      expect(response?.status()).toBe(404)
      expect(page.url()).not.toContain('/auth/login')
      expect(page.url()).not.toContain('/join-school')
    })
  }

  test('logged out, an unknown path in Spanish also 404s', async ({ page }) => {
    const response = await page.goto(`${TENANT_BASE}/es/no-existe-esta-ruta`)

    expect(response?.status()).toBe(404)
    expect(page.url()).not.toContain('/auth/login')
  })

  test('logged in, an unknown path 404s instead of bouncing to join-school', async ({ page }) => {
    await loginAsStudent(page, BASE)
    const response = await page.goto(`${BASE}/${LOCALE}/esta-pagina-no-existe`)

    expect(response?.status()).toBe(404)
    expect(page.url()).not.toContain('/join-school')
  })
})

test.describe('the guards that must not have moved', () => {
  const PROTECTED = [
    '/dashboard/student',
    '/dashboard/teacher',
    '/dashboard/admin',
    '/platform',
    '/onboarding',
    '/join-school',
  ]

  for (const path of PROTECTED) {
    test(`logged out, ${path} still redirects to login and carries the destination`, async ({ page }) => {
      await page.goto(`${TENANT_BASE}/${LOCALE}${path}`)
      await page.waitForURL(/\/auth\/login/)

      const url = new URL(page.url())
      const carried = url.searchParams.get('redirectTo') ?? url.searchParams.get('next') ?? ''
      expect(decodeURIComponent(carried)).toContain(path)
    })
  }

  test('logged out, /join-school redirects server-side with no blank paint', async ({ page }) => {
    // The redirect must come from the proxy, not from the page after its
    // loading skeleton has already streamed (#728): a server-side redirect
    // never renders the join page's own markup.
    const response = await page.goto(`${TENANT_BASE}/${LOCALE}/join-school`)

    expect(page.url()).toContain('/auth/login')
    expect(response?.status()).toBeLessThan(400)
    await expect(page.locator('[data-testid="join-school-form"]')).toHaveCount(0)
  })
})

test.describe('public pages stay public', () => {
  const PUBLIC = ['/', '/courses', '/pricing', '/auth/login', '/auth/sign-up']

  for (const path of PUBLIC) {
    test(`logged out, ${path} renders without a login redirect`, async ({ page }) => {
      const response = await page.goto(`${TENANT_BASE}/${LOCALE}${path}`)

      expect(response?.status()).toBeLessThan(400)
      if (!path.startsWith('/auth')) {
        expect(page.url()).not.toContain('/auth/login')
      }
    })
  }
})

test.describe('purchase intent survives the sign-up hop', () => {
  test('a product link sends an anonymous visitor to sign-up carrying the product', async ({ page }) => {
    // The buyer-side half of #728. The sign-up form forwards `next` into the
    // confirmation link, and `/auth/confirm` now hands it to `/join-school`,
    // so the product survives both the auto-confirm and the email-confirm path.
    await page.goto(`${BASE}/${LOCALE}/auth/sign-up?next=%2Fproducts%2F1002`)

    const signUpLink = page.locator('a[href*="/auth/login"]').first()
    await expect(signUpLink).toHaveAttribute('href', /next=%2Fproducts%2F1002/)
  })
})
