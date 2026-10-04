import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'
import { loginAsStudent } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'

/**
 * Regression net for LMS-FRONT-9F / 8F (issue #679).
 *
 * Production reports `Rendered more hooks than during the previous render` on
 * `/dashboard/student/profile` and on `/dashboard/student`. Two exhaustive
 * static audits — a line-by-line read of every client component and custom hook
 * on both routes, plus a repo-wide `react-hooks/rules-of-hooks` run whose only
 * hits are Puck's lowercase `render()` factories — found no conditional hook,
 * and the source-mapped stack that would name the component has not arrived.
 *
 * So this spec does not assert a fix. It asserts the *symptom* is absent, on
 * both routes, on every CI run: a hooks-order violation is a hard React crash,
 * so it always surfaces as a page error or a console error carrying one of the
 * signatures below. If the bug returns — or is introduced by a refactor — this
 * fails instead of silently reaching production again.
 *
 * It deliberately does not assert "no console errors at all": these pages log
 * benign warnings (a missing local gamification edge function, analytics
 * beacons blocked on http) and a blanket assertion would rot within a week.
 */

/**
 * React's hook-order crash, in every form it reaches a browser console.
 * `#310` is the minified code for "Rendered more hooks than during the previous
 * render"; `#300`/`#301` are its dev-build siblings for the same invariant.
 */
const HOOK_ORDER_SIGNATURES = [
  /Rendered more hooks than during the previous render/i,
  /Rendered fewer hooks than expected/i,
  /Should have a queue\. This is likely a bug in React/i,
  /Minified React error #(?:300|301|310)\b/,
]

function isHookOrderCrash(text: string): boolean {
  return HOOK_ORDER_SIGNATURES.some((signature) => signature.test(text))
}

/** Collect everything the page reports, so a failure can name the offender. */
function captureClientErrors(page: Page): string[] {
  const messages: string[] = []
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}\n${error.stack ?? ''}`))
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') messages.push(`console.error: ${message.text()}`)
  })
  return messages
}

const ROUTES = [
  { name: 'student dashboard (LMS-FRONT-8F)', path: `/${LOCALE}/dashboard/student` },
  { name: 'student profile (LMS-FRONT-9F)', path: `/${LOCALE}/dashboard/student/profile` },
]

test.describe('Student dashboard renders without a React hook-order crash (#679)', () => {
  for (const route of ROUTES) {
    test(route.name, async ({ page }) => {
      const clientErrors = captureClientErrors(page)

      await loginAsStudent(page)
      await page.goto(`${BASE}${route.path}`)

      // The crash happens during a client render, which is after the server
      // HTML lands — so waiting for the network to settle is what gives the
      // client the chance to fail. The gamification widgets on both routes
      // fetch on mount, which is exactly the state transition under suspicion.
      await page.waitForLoadState('networkidle')
      await expect(page.locator('main, [data-slot="sidebar-inset"]').first()).toBeVisible({
        timeout: 30_000,
      })

      const hookCrashes = clientErrors.filter(isHookOrderCrash)
      expect(
        hookCrashes,
        `React hook-order crash on ${route.path}. This is LMS-FRONT-9F/8F reproducing — ` +
          `the stack below names the component that changed its hook count:\n${hookCrashes.join('\n\n')}`
      ).toEqual([])

      // A hooks crash that escapes to the route's error boundary shows this
      // copy instead of the page, which is worth failing on even if the console
      // message was swallowed.
      await expect(page.getByText(/Couldn't load your courses/i)).toHaveCount(0)
    })
  }
})
