import type { Page } from '@playwright/test'
import { BASE, TENANT_BASE, LOCALE, ACCOUNTS } from './constants'

/**
 * Generic login using data-testid selectors (the proven working pattern).
 */
export async function login(
  page: Page,
  email: string,
  password: string,
  baseUrl = BASE
) {
  await page.goto(`${baseUrl}/${LOCALE}/auth/login`)
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await page.waitForURL('**/dashboard/**', { timeout: 20_000 })
}

/** Login as student on default tenant (lvh.me:3000) */
export async function loginAsStudent(page: Page, baseUrl = BASE) {
  await login(page, ACCOUNTS.student.email, ACCOUNTS.student.password, baseUrl)
}

/** Login as teacher/owner on default tenant (lvh.me:3000) */
export async function loginAsTeacher(page: Page, baseUrl = BASE) {
  await login(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, baseUrl)
}

/** Login as admin on code-academy tenant (code-academy.lvh.me:3000) */
export async function loginAsAdmin(page: Page, baseUrl = TENANT_BASE) {
  await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, baseUrl)
}

/** Login as student on code-academy tenant (code-academy.lvh.me:3000) */
export async function loginAsTenantStudent(page: Page, baseUrl = TENANT_BASE) {
  await login(
    page,
    ACCOUNTS.tenantStudent.email,
    ACCOUNTS.tenantStudent.password,
    baseUrl
  )
}
