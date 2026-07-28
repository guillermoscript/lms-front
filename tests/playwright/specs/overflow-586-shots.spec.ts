import { test } from '@playwright/test'
import { loginAsStudent } from '../utils/auth'
import { BASE, LOCALE } from '../utils/constants'

/**
 * Screenshot capture for issue #586. Run with SHOT_LABEL=before (untouched code)
 * and again with SHOT_LABEL=after (with the fix) to produce a matching pair.
 */

const LABEL = process.env.SHOT_LABEL || 'before'
const OUT = process.env.SHOT_DIR || 'docs/qa'

const SHOTS = [
  { name: 'student-dashboard', path: `/${LOCALE}/dashboard/student`, width: 768 },
  { name: 'student-dashboard', path: `/${LOCALE}/dashboard/student`, width: 820 },
  { name: 'student-courses', path: `/${LOCALE}/dashboard/student/courses`, width: 768 },
]

test('capture #586 shots', async ({ page }) => {
  test.setTimeout(180_000)
  await loginAsStudent(page)

  for (const shot of SHOTS) {
    await page.setViewportSize({ width: shot.width, height: 900 })
    await page.goto(`${BASE}${shot.path}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1200)

    // Scroll fully right so the shot shows the overflow rather than hiding it.
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement
      return { client: doc.clientWidth, scroll: doc.scrollWidth }
    })
    console.log(
      `${shot.name}@${shot.width} client=${metrics.client} scroll=${metrics.scroll} overflow=${metrics.scroll - metrics.client}`
    )

    await page.screenshot({
      path: `${OUT}/586-${LABEL}-${shot.name}-${shot.width}.png`,
    })

    if (metrics.scroll > metrics.client) {
      await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0))
      await page.waitForTimeout(400)
      await page.screenshot({
        path: `${OUT}/586-${LABEL}-${shot.name}-${shot.width}-scrolled-right.png`,
      })
    }
  }
})
