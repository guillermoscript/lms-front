import { test, expect } from '@playwright/test'
import { loginAsStudent, loginAsTeacher } from '../utils/auth'
import { BASE, LOCALE } from '../utils/constants'

/**
 * Issue #586 — the dashboard shell scrolls horizontally between 768px and ~890px.
 *
 * `SidebarInset` is `w-full flex-1` with no `min-w-0`, so it cannot shrink below
 * its min-content width. At `md` the 256px desktop sidebar appears at the same
 * moment the header's right-hand cluster stops being compact, and between them
 * they demand more room than the viewport has.
 */

const WIDTHS = [700, 768, 800, 850, 900, 1024, 1280]

const PAGES = [
  { name: 'student-dashboard', path: `/${LOCALE}/dashboard/student` },
  { name: 'student-courses', path: `/${LOCALE}/dashboard/student/courses` },
  { name: 'student-browse', path: `/${LOCALE}/dashboard/student/browse` },
]

const TEACHER_PAGES = [
  { name: 'teacher-dashboard', path: `/${LOCALE}/dashboard/teacher` },
  { name: 'admin-dashboard', path: `/${LOCALE}/dashboard/admin` },
]

type Measurement = {
  page: string
  width: number
  clientWidth: number
  scrollWidth: number
  overflow: number
}

async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const main = document.querySelector('[data-slot="sidebar-inset"]')
    const mainRect = main?.getBoundingClientRect()
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      mainLeft: mainRect ? Math.round(mainRect.left) : null,
      mainWidth: mainRect ? Math.round(mainRect.width) : null,
    }
  })
}

test.describe('#586 dashboard shell horizontal overflow', () => {
  test('student pages do not scroll sideways at any width', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsStudent(page)

    const rows: Measurement[] = []

    for (const target of PAGES) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`${BASE}${target.path}`)
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(600)
        const m = await measure(page)
        rows.push({
          page: target.name,
          width,
          clientWidth: m.clientWidth,
          scrollWidth: m.scrollWidth,
          overflow: m.scrollWidth - m.clientWidth,
        })
        console.log(
          `${target.name} @${width}: client=${m.clientWidth} scroll=${m.scrollWidth} overflow=${m.scrollWidth - m.clientWidth} main=${m.mainLeft}/${m.mainWidth}`
        )
      }
    }

    console.log('\n=== SUMMARY ===')
    for (const r of rows) {
      console.log(`${r.page}\t${r.width}\t${r.clientWidth}\t${r.scrollWidth}\t${r.overflow}`)
    }

    const offenders = rows.filter((r) => r.overflow > 0)
    expect(
      offenders,
      `pages scrolling horizontally: ${JSON.stringify(offenders, null, 2)}`
    ).toEqual([])
  })

  test('teacher and admin pages do not scroll sideways at any width', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsTeacher(page)

    const rows: Measurement[] = []

    for (const target of TEACHER_PAGES) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`${BASE}${target.path}`)
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(600)
        const m = await measure(page)
        rows.push({
          page: target.name,
          width,
          clientWidth: m.clientWidth,
          scrollWidth: m.scrollWidth,
          overflow: m.scrollWidth - m.clientWidth,
        })
        console.log(
          `${target.name} @${width}: client=${m.clientWidth} scroll=${m.scrollWidth} overflow=${m.scrollWidth - m.clientWidth} main=${m.mainLeft}/${m.mainWidth}`
        )
      }
    }

    const offenders = rows.filter((r) => r.overflow > 0)
    expect(
      offenders,
      `pages scrolling horizontally: ${JSON.stringify(offenders, null, 2)}`
    ).toEqual([])
  })

  /**
   * The header hides the gamification card below `lg`; the avatar dropdown shows
   * it below `lg`. Those two gates are a pair — if they ever drift apart the
   * streak and coins silently vanish (or double up) in the gap. This asserts the
   * card is visible in exactly one place at each width.
   */
  test('gamification card is reachable at every width, in exactly one place', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await loginAsStudent(page)

    for (const width of [700, 768, 850, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${BASE}/${LOCALE}/dashboard/student`)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(800)

      const headerCard = page.locator('header [data-slot="gamification-header-card"]')
      const headerVisible = await headerCard.isVisible().catch(() => false)

      // Open the avatar dropdown and look for the card inside it. Clicking a
      // base-ui Button through Playwright is unreliable, so dispatch it in-page.
      await page.evaluate(() => {
        const btn = document.querySelector<HTMLElement>(
          '[data-testid="user-nav-trigger"]'
        )
        if (!btn) throw new Error('user-nav-trigger not found')
        btn.click()
      })
      await page.waitForTimeout(700)
      const menuCard = page.locator(
        '[role="menu"] [data-slot="gamification-header-card"], [data-side] [data-slot="gamification-header-card"]'
      )
      const menuVisible = await menuCard.first().isVisible().catch(() => false)
      await page.keyboard.press('Escape')

      console.log(`@${width}: header=${headerVisible} dropdown=${menuVisible}`)

      expect(
        headerVisible || menuVisible,
        `at ${width}px the gamification card is in neither the header nor the dropdown`
      ).toBe(true)
      expect(
        headerVisible && menuVisible,
        `at ${width}px the gamification card is duplicated in header and dropdown`
      ).toBe(false)

      // Above lg it belongs in the header; below lg, in the dropdown.
      expect(headerVisible, `header card visibility at ${width}px`).toBe(width >= 1024)
    }
  })
})
