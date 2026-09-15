/**
 * Issue #662 — plan features are enforced server-side and the UI shows the
 * upgrade nudge where the server said no.
 *
 * Default School is on Free (analytics: none, certificates: basic, no custom
 * branding); Code Academy is on Enterprise (everything). Same pages, both
 * tenants: the gate must appear on one and not the other.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAsTeacher, loginAsAdmin } from './utils/auth'
import { BASE, TENANT_BASE, LOCALE } from './utils/constants'

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

test.describe('Plan feature gates (#662)', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'staff console pages are desktop-first; gate logic is viewport-independent')
  })

  test('the plan feature JSON carries every gated key after the backfill', async () => {
    const { data } = await admin.from('platform_plans').select('slug, features').order('sort_order')
    const bySlug = Object.fromEntries((data ?? []).map((p) => [p.slug, p.features as Record<string, unknown>]))
    for (const slug of ['free', 'starter', 'pro', 'business', 'enterprise']) {
      for (const key of ['community', 'remove_branding', 'voice_exercises', 'landing_pages', 'api_access']) {
        expect(bySlug[slug], `${slug}.${key}`).toHaveProperty(key)
      }
      expect(bySlug[slug].api_access, `${slug}.api_access`).toBe(true)
    }
    expect(bySlug.free.remove_branding).toBe(false)
    expect(bySlug.pro.remove_branding).toBe(true)
  })

  test('Free tenant: analytics, branding and certificate design are nudged', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsTeacher(page, BASE) // owner@e2etest.com — Default School admin

    await page.goto(`${BASE}/${LOCALE}/dashboard/admin/analytics`)
    await expect(page.getByTestId('upgrade-nudge')).toBeVisible()
    await expect(page.getByTestId('upgrade-nudge')).toHaveAttribute('data-feature', 'analytics')

    await page.goto(`${BASE}/${LOCALE}/dashboard/admin/appearance`)
    // Themes and their recommended colours are open on every plan (#763); only
    // a custom hex is nudged, in its own section, with no input behind it.
    await expect(
      page.locator('[data-testid="theme-kit-custom-color"] [data-testid="upgrade-nudge"][data-feature="custom_branding"]'),
    ).toBeVisible()
    await expect(page.getByTestId('theme-kit-theme-estructura')).toBeVisible()
    await expect(page.getByTestId('theme-kit-custom-hex')).toHaveCount(0)
    // Logo stays editable on every plan; the legacy colour field is gone.
    await expect(page.locator('#logo_url')).toBeVisible()
    await expect(page.locator('#primary_color')).toHaveCount(0)

    const { data: course } = await admin
      .from('courses')
      .select('course_id')
      .eq('tenant_id', DEFAULT_TENANT)
      .order('course_id')
      .limit(1)
      .single()
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${course!.course_id}/certificates/settings`)
    await expect(page.getByTestId('certificate-design-locked')).toBeVisible()
  })

  test('Enterprise tenant: the same pages are fully unlocked', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page, TENANT_BASE) // creator@codeacademy.com — Code Academy admin

    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/analytics`)
    await expect(page.locator('[data-testid="upgrade-nudge"]')).toHaveCount(0)

    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/appearance`)
    await expect(page.locator('[data-testid="upgrade-nudge"]')).toHaveCount(0)
    const customColor = page.getByTestId('theme-kit-custom-color')
    await expect(customColor).toBeVisible()
    // The hex field sits behind the "use a custom colour" toggle. Only press it
    // while the field is hidden, so a retry never toggles it shut; a DOM click
    // because a click can land before hydration attaches the handler.
    const customHex = page.getByTestId('theme-kit-custom-hex')
    await expect(async () => {
      if (!(await customHex.isVisible())) {
        await page
          .getByTestId('theme-kit-custom-toggle')
          .evaluate((el: HTMLElement) => el.click(), undefined, { timeout: 2_000 })
      }
      await expect(customHex).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })

  test('public pricing table no longer sells API access', async ({ page }) => {
    await page.goto(`${BASE}/${LOCALE}/platform-pricing`)
    await page.waitForLoadState('networkidle')
    // Feature-row labels only: the Enterprise plan description still mentions
    // "API access" in prose, which is fine — it is the comparison row that sold it.
    await expect(page.getByText('API Access', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Remove "Powered by" branding', { exact: true }).first()).toBeVisible()
  })
})
