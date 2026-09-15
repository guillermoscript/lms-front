import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAsStudent, loginAsTeacher } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'
import { DEFAULT_TENANT, getServiceRoleClient } from './utils/seed-state'

/**
 * Issue #763 — the theme kit picker, end to end on a Free school.
 *
 * Default School is on Free (no `custom_branding`), which is the point: themes
 * and their six recommended colours are open to every plan, a custom hex is
 * not. What unit tests cannot show is the whole loop — the admin's pick saved
 * through the server action, the root layout rendering it for a student (with
 * the theme's heading font actually applied), and the onboarding wizard saving
 * a theme for a school that the old gate refused on every click.
 *
 * Swatch hexes here are pinned against `KIT_THEMES` in
 * `tests/unit/theme-kit.test.ts` (Andina index 1 = Terracota, Luz index 1 =
 * Coral).
 */

const APPEARANCE = `${BASE}/${LOCALE}/dashboard/admin/appearance`
const ONBOARDING = `${BASE}/${LOCALE}/onboarding`
// Seeded: student@e2etest.com is entitled to course 1001, whose first lesson is 1001.
const LESSON = `${BASE}/${LOCALE}/dashboard/student/courses/1001/lessons/1001`
const LESSON_TITLE = 'What is Software Testing?'
const THEME_SETTING_KEY = 'theme_preset'

const ANDINA_TERRACOTA = { type: 'kit', theme: 'andina', brand: '#9A3F2C' }
const LUZ_CORAL = { type: 'kit', theme: 'luz', brand: '#E4572E' }

async function clearTheme() {
  const { error } = await getServiceRoleClient()
    .from('tenant_settings')
    .delete()
    .eq('tenant_id', DEFAULT_TENANT)
    .eq('setting_key', THEME_SETTING_KEY)
  if (error) throw new Error(`could not clear Default School's theme: ${error.message}`)
}

async function storedTheme(): Promise<unknown> {
  const { data, error } = await getServiceRoleClient()
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', DEFAULT_TENANT)
    .eq('setting_key', THEME_SETTING_KEY)
    .maybeSingle()
  if (error) throw new Error(`could not read Default School's theme: ${error.message}`)
  return data?.setting_value ?? null
}

/** React stamps `__reactProps$…` on a node once it hydrates; a click before that does nothing. */
async function waitForHydration(locator: Locator) {
  await expect
    .poll(
      () => locator.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))),
      { timeout: 60_000, intervals: [250, 500, 1000] },
    )
    .toBe(true)
}

/**
 * Theme cards and swatches are base-ui radios, and a Playwright click on a
 * base-ui control intermittently lands without firing its handler (see
 * utils/auth.ts). Click, and fall back to a DOM click if the radio did not check.
 */
async function choose(radio: Locator) {
  await expect(radio).toBeVisible()
  await waitForHydration(radio)
  await radio.click()
  const checked = await expect(radio)
    .toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
    .then(() => true, () => false)
  if (!checked) await radio.evaluate((el: HTMLElement) => el.click())
  await expect(radio).toHaveAttribute('aria-checked', 'true')
}

/** Press a base-ui Button once, after hydration, with a DOM click. */
async function press(button: Locator) {
  await expect(button).toBeEnabled()
  await waitForHydration(button)
  await button.evaluate((el: HTMLElement) => el.click())
}

/**
 * Every computed `--primary` inside the lesson preview. The preview's vars sit
 * on a wrapper in there, so its content resolves the previewed colour; the page
 * itself is on the platform palette (the row was cleared), which never equals
 * a kit swatch.
 */
function previewPrimaries(page: Page): Promise<string[]> {
  return page.getByTestId('theme-kit-preview-lesson').evaluate((root) =>
    [root, ...Array.from(root.querySelectorAll('*'))].map((el) =>
      getComputedStyle(el).getPropertyValue('--primary').trim().toUpperCase(),
    ),
  )
}

test.describe.configure({ mode: 'serial' })

test.describe('theme kit picker (#763)', () => {
  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== 'desktop-chromium') return
    await clearTheme()
  })

  // A service-role delete skips revalidatePath, so the root layout may keep
  // this theme cached for up to 60s after the spec. No other spec reads the
  // school's colours.
  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== 'desktop-chromium') return
    await clearTheme()
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      "runs once — it rewrites Default School's theme, which is shared DB state",
    )
  })

  test('a Free school admin picks Andina · Terracota and saves it; the custom colour stays locked', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await loginAsTeacher(page, BASE) // owner@e2etest.com — Default School admin
    await page.goto(APPEARANCE, { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('theme-kit-picker')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-testid^="theme-kit-theme-"]')).toHaveCount(4)
    for (const id of ['estructura', 'andina', 'kodigo', 'luz']) {
      await expect(page.getByTestId(`theme-kit-theme-${id}`)).toBeVisible()
    }

    const andina = page.getByTestId('theme-kit-theme-andina')
    await choose(andina)
    // Picking a theme resets the colour to its recommended swatch (Verde andino),
    // and the preview follows without a round trip.
    await expect(page.getByTestId('theme-kit-swatch-2F6B4F')).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => previewPrimaries(page)).toContain('#2F6B4F')

    const terracota = page.getByTestId('theme-kit-swatch-9A3F2C')
    await choose(terracota)
    await expect(page.getByTestId('theme-kit-swatch-2F6B4F')).not.toHaveAttribute('aria-checked', 'true')
    await expect(andina).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('theme-kit-readability')).toHaveAttribute('data-readability', 'light-ink')
    await expect.poll(() => previewPrimaries(page)).toContain('#9A3F2C')

    // A custom hex is Business+: Free sees the nudge in its place, no input.
    await expect(
      page.locator('[data-testid="theme-kit-custom-color"] [data-testid="upgrade-nudge"][data-feature="custom_branding"]'),
    ).toBeVisible()
    await expect(page.getByTestId('theme-kit-custom-hex')).toHaveCount(0)

    await press(page.getByTestId('theme-kit-save'))
    await expect.poll(storedTheme, { timeout: 20_000, intervals: [500, 1000] }).toEqual(ANDINA_TERRACOTA)
  })

  test("a student of that school gets the saved colour and Andina's heading font", async ({ browser }) => {
    test.setTimeout(180_000)
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await loginAsStudent(page, BASE)

      // The root layout caches branding for 60s. The save revalidates the
      // layout, but reload until it shows so a stale entry cannot fail this.
      await expect
        .poll(
          async () => {
            await page.goto(LESSON, { waitUntil: 'domcontentloaded' })
            return page.evaluate(() =>
              getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toUpperCase(),
            )
          },
          { timeout: 75_000, intervals: [1_000, 5_000] },
        )
        .toBe('#9A3F2C')

      // Andina sets --font-heading to var(--font-lora), … and globals.css puts
      // h1 in --font-heading. next/font hashes family names, so compare against
      // the family --font-lora resolves to rather than the literal "Lora".
      const title = page.locator('h1', { hasText: LESSON_TITLE }).first()
      await expect(title).toBeVisible()
      const fonts = await title.evaluate((h1) => ({
        heading: getComputedStyle(h1).fontFamily,
        lora: getComputedStyle(document.documentElement).getPropertyValue('--font-lora'),
      }))
      const firstFamily = (stack: string) => stack.split(',')[0].trim().replace(/^["']|["']$/g, '')
      expect(firstFamily(fonts.lora), '--font-lora is declared on <html>').not.toBe('')
      expect(firstFamily(fonts.heading)).toBe(firstFamily(fonts.lora))
    } finally {
      await context.close()
    }
  })

  test('the onboarding branding step keeps the platform look on an untouched Next and saves a pick for a Free school', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await clearTheme()
    await loginAsTeacher(page, BASE)
    await page.goto(ONBOARDING, { waitUntil: 'domcontentloaded' })

    // welcome → school (only while the school has no name) → branding.
    const picker = page.getByTestId('theme-kit-picker')
    await expect(async () => {
      if (await picker.isVisible()) return
      const schoolName = page.locator('#schoolName')
      if (await schoolName.isVisible()) {
        if (!(await schoolName.inputValue()).trim()) await schoolName.fill('Default School')
        await page
          .getByRole('button', { name: /continue|next/i })
          .first()
          .evaluate((el: HTMLElement) => el.click(), undefined, { timeout: 2_000 })
      } else {
        await page
          .getByRole('button', { name: /get started/i })
          .evaluate((el: HTMLElement) => el.click(), undefined, { timeout: 2_000 })
      }
      await expect(picker).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })

    // Nothing stored yet: the step says so, and Next without a pick moves on
    // WITHOUT writing — the school keeps the platform look. The picker only
    // unmounts after a save resolves, so once it is gone the row is final.
    await expect(page.getByTestId('theme-kit-status')).toBeVisible()
    await press(page.getByTestId('theme-kit-save')) // "Next"
    await expect(picker).toHaveCount(0)
    expect(await storedTheme()).toBeNull()

    // Back to the branding step; a real pick is saved on Next.
    await page
      .getByRole('button', { name: /back/i })
      .first()
      .evaluate((el: HTMLElement) => el.click())
    await expect(picker).toBeVisible()

    await choose(page.getByTestId('theme-kit-theme-luz'))
    await choose(page.getByTestId('theme-kit-swatch-E4572E'))
    await press(page.getByTestId('theme-kit-save')) // "Next"

    await expect.poll(storedTheme, { timeout: 20_000, intervals: [500, 1000] }).toEqual(LUZ_CORAL)
    // The wizard moved on to the next step.
    await expect(picker).toHaveCount(0)
    // No plan refusal on the way.
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
    await expect(page.getByText(/requires the \w+ plan or higher/i)).toHaveCount(0)
  })
})
