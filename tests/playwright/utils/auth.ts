import { expect, type Page } from '@playwright/test'
import { BASE, TENANT_BASE, LOCALE, ACCOUNTS } from './constants'

/**
 * Disable all guided tours by setting the global kill-switch in localStorage.
 * Must be called after navigating to the app domain (localStorage is per-origin).
 */
async function dismissTours(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('tours-disabled', 'true')
  })
}

/**
 * Fill the login fields and prove the values survived.
 *
 * The inputs are React-controlled, so a `fill()` that lands before hydration is
 * wiped by the first client render and the form posts an empty email — which
 * GoTrue rejects as "missing email or phone", not as bad credentials. The same
 * moment also swallows clicks on Login, since `onSubmit` is not attached yet.
 */
async function fillCredentials(page: Page, email: string, password: string) {
  const emailField = page.getByTestId('login-email')
  await emailField.waitFor({ state: 'visible', timeout: 30_000 })

  await expect
    .poll(
      async () => {
        await emailField.fill(email)
        await page.getByTestId('login-password').fill(password)
        // Reading straight back proves nothing: the server-rendered input holds
        // whatever it is given, and React only wipes it on its first client
        // render. Wait past that render, so a value still standing here is one
        // component state actually accepted — which also means the submit
        // handler is attached and the button will do something.
        await page.waitForTimeout(750)
        return emailField.inputValue()
      },
      { timeout: 45_000, intervals: [500, 1000] }
    )
    .toBe(email)
}

/**
 * Press Login and make sure it took.
 *
 * The submit control is a base-ui Button, and a Playwright click on one
 * intermittently lands without firing the handler — the form just sits there
 * and the wait for `/dashboard/` burns its whole budget on a page that was
 * never submitted. Re-press until the app actually navigates.
 */
async function submitLogin(page: Page, baseUrl: string) {
  const button = page.getByTestId('login-submit')
  const arrived = () => page.url().includes('/dashboard/')

  for (let attempt = 0; attempt < 3 && !arrived(); attempt++) {
    await button.click().catch(() => undefined)
    // Long enough for the token grant plus the redirect it triggers.
    await page
      .waitForURL('**/dashboard/**', { timeout: 20_000, waitUntil: 'commit' })
      .catch(() => undefined)
  }
  if (!arrived()) {
    throw new Error(`Login never reached the dashboard (still at ${page.url()}, from ${baseUrl})`)
  }
}

/**
 * Generic login using data-testid selectors (the proven working pattern).
 * Automatically dismisses all guided tours after login.
 */
export async function login(
  page: Page,
  email: string,
  password: string,
  baseUrl = BASE
) {
  // `domcontentloaded`, not the default `load`: pages here keep background
  // polls in flight, so waiting for `load` aborts on a page that has arrived.
  await page.goto(`${baseUrl}/${LOCALE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await fillCredentials(page, email, password)
  await submitLogin(page, baseUrl)
  await dismissTours(page)
}

/** Login as student on the default tenant */
export async function loginAsStudent(page: Page, baseUrl = BASE) {
  await login(page, ACCOUNTS.student.email, ACCOUNTS.student.password, baseUrl)
}

/** Login as teacher/owner on the default tenant */
export async function loginAsTeacher(page: Page, baseUrl = BASE) {
  await login(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, baseUrl)
}

/** Login as admin on the code-academy tenant */
export async function loginAsAdmin(page: Page, baseUrl = TENANT_BASE) {
  await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, baseUrl)
}

/** Login as student on the code-academy tenant */
export async function loginAsTenantStudent(page: Page, baseUrl = TENANT_BASE) {
  await login(
    page,
    ACCOUNTS.tenantStudent.email,
    ACCOUNTS.tenantStudent.password,
    baseUrl
  )
}

/**
 * Login as super admin on the platform domain (default tenant).
 * After login, navigates to /en/platform (does NOT wait for dashboard/**).
 */
export async function loginAsSuperAdmin(page: Page, baseUrl = BASE) {
  await page.goto(`${baseUrl}/${LOCALE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await fillCredentials(page, ACCOUNTS.superAdmin.email, ACCOUNTS.superAdmin.password)
  // Super admin lands on /dashboard/teacher — then navigate to platform
  await submitLogin(page, baseUrl)
  await dismissTours(page)
  await page.goto(`${baseUrl}/${LOCALE}/platform`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="platform-overview"]', { timeout: 15_000 })
}
