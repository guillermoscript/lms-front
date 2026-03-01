import type { Page } from '@playwright/test'
import { BASE, LOCALE, PAUSE } from './demo-constants'

/**
 * Navigate to a URL and wait for the page to fully settle.
 * Uses 'load' instead of 'networkidle' because Supabase real-time
 * connections keep the network active indefinitely.
 */
export async function navigateAndSettle(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
  // Give React hydration + data fetching time to render content
  await page.waitForTimeout(PAUSE.ABSORB)
}

/**
 * Type text character by character for a cinematic effect.
 * Uses pressSequentially with a delay between keystrokes.
 */
export async function cinematicType(
  page: Page,
  selector: string,
  text: string,
  options?: { delay?: number }
) {
  const el = page.locator(selector).first()
  await el.scrollIntoViewIfNeeded()
  await el.click()
  await el.pressSequentially(text, { delay: options?.delay ?? 80 })
  await page.waitForTimeout(PAUSE.GLANCE)
}

/**
 * Type into an element found by test ID, character by character.
 */
export async function cinematicTypeByTestId(
  page: Page,
  testId: string,
  text: string,
  options?: { delay?: number }
) {
  const el = page.getByTestId(testId)
  await el.scrollIntoViewIfNeeded()
  await el.click()
  await el.pressSequentially(text, { delay: options?.delay ?? 80 })
  await page.waitForTimeout(PAUSE.GLANCE)
}

/**
 * Hover first (so the viewer sees what we're about to click), then click.
 */
export async function cinematicClick(page: Page, selector: string) {
  const el = page.locator(selector).first()
  await el.scrollIntoViewIfNeeded()
  await el.hover()
  await page.waitForTimeout(400)
  await el.click()
  await page.waitForTimeout(PAUSE.GLANCE)
}

/**
 * Hover + click using a test ID.
 */
export async function cinematicClickByTestId(page: Page, testId: string) {
  const el = page.getByTestId(testId)
  await el.scrollIntoViewIfNeeded()
  await el.hover()
  await page.waitForTimeout(400)
  await el.click()
  await page.waitForTimeout(PAUSE.GLANCE)
}

/**
 * Click a link or button by its visible text.
 */
export async function cinematicClickText(page: Page, text: string) {
  const el = page.getByRole('link', { name: text }).or(page.getByRole('button', { name: text })).first()
  await el.scrollIntoViewIfNeeded()
  await el.hover()
  await page.waitForTimeout(400)
  await el.click()
  await page.waitForTimeout(PAUSE.GLANCE)
}

/**
 * Hover over an element to draw attention (uses CSS :hover states).
 */
export async function spotlightHover(page: Page, selector: string, duration?: number) {
  const el = page.locator(selector).first()
  await el.scrollIntoViewIfNeeded()
  await el.hover()
  await page.waitForTimeout(duration ?? PAUSE.READ)
}

/**
 * Smooth multi-step scrolling — uses native smooth scroll instead of mouse.wheel
 * for buttery-smooth animation that looks great in recordings.
 */
export async function cinematicScroll(
  page: Page,
  direction: 'down' | 'up' = 'down',
  distance = 600,
  steps = 4
) {
  const stepSize = Math.round(distance / steps)
  const sign = direction === 'down' ? 1 : -1
  for (let i = 0; i < steps; i++) {
    await page.evaluate((scrollY) => {
      window.scrollBy({ top: scrollY, behavior: 'smooth' })
    }, stepSize * sign)
    await page.waitForTimeout(350)
  }
  await page.waitForTimeout(PAUSE.GLANCE)
}

/**
 * Wait for a data-testid element to appear before proceeding.
 * Falls back gracefully after timeout so demos don't hard-fail.
 */
export async function waitForTestId(page: Page, testId: string, timeout = 8000): Promise<boolean> {
  try {
    await page.getByTestId(testId).waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

/**
 * Cinematic login — visible character-by-character typing of credentials.
 */
export async function cinematicLogin(
  page: Page,
  email: string,
  password: string,
  baseUrl = BASE
) {
  await navigateAndSettle(page, `${baseUrl}/${LOCALE}/auth/login`)
  await page.waitForTimeout(PAUSE.READ)

  await cinematicTypeByTestId(page, 'login-email', email, { delay: 60 })
  await cinematicTypeByTestId(page, 'login-password', password, { delay: 60 })
  await page.waitForTimeout(PAUSE.GLANCE)

  await cinematicClickByTestId(page, 'login-submit')
  await page.waitForURL('**/dashboard/**', { timeout: 20_000 })
  await page.waitForTimeout(PAUSE.ABSORB)
}
