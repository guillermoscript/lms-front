import { test } from '@playwright/test'
import { loginAsStudent } from '../utils/auth'
import { BASE, LOCALE } from '../utils/constants'
import fs from 'node:fs'

/**
 * Frame capture for the issue #586 GIF. Sweeps the viewport across the broken
 * band (700 → 1024) and holds a few frames at each end, then opens the avatar
 * dropdown at 820px to show the gamification card is still reachable there.
 *
 * Run with SHOT_LABEL=before / SHOT_LABEL=after; stitch the frames with ffmpeg.
 */

const LABEL = process.env.SHOT_LABEL || 'after'
const DIR = `${process.env.FRAME_DIR || '/tmp/586-frames'}/${LABEL}`

const WIDTHS = [
  700, 700, 720, 740, 768, 768, 768, 790, 810, 830, 850, 870, 890, 910, 940,
  970, 1000, 1024, 1024, 1024,
]

test('capture #586 gif frames', async ({ page }) => {
  test.setTimeout(240_000)
  fs.mkdirSync(DIR, { recursive: true })

  await loginAsStudent(page)
  await page.setViewportSize({ width: 1024, height: 820 })
  await page.goto(`${BASE}/${LOCALE}/dashboard/student`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2000)

  let i = 0
  const shot = async () => {
    await page.screenshot({
      path: `${DIR}/frame-${String(i).padStart(4, '0')}.png`,
    })
    i++
  }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 820 })
    await page.waitForTimeout(320)
    const m = await page.evaluate(() => ({
      c: document.documentElement.clientWidth,
      s: document.documentElement.scrollWidth,
    }))
    console.log(`${LABEL} @${width}: overflow=${m.s - m.c}`)
    await shot()
  }

  // The "before" recording is only about the sideways scroll; the dropdown
  // segment below shows the post-fix trade and would be misleading there.
  if (LABEL === 'before') return

  // Hold at 820 and open the avatar menu — the gamification card lives here
  // below `lg`, which is the trade this change makes.
  await page.setViewportSize({ width: 820, height: 820 })
  await page.waitForTimeout(500)
  await shot()
  await shot()
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-testid="user-nav-trigger"]')?.click()
  })
  await page.waitForTimeout(900)
  for (let k = 0; k < 8; k++) await shot()
})
