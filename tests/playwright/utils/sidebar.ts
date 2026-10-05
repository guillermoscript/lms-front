import { expect, type Page } from '@playwright/test'

/** Mobile navigation is mounted only after opening the sidebar sheet. */
export async function openSidebar(page: Page) {
  const mobile = await page.evaluate(() => window.matchMedia('(max-width: 767px)').matches)
  if (!mobile || await page.locator('[data-sidebar="sidebar"][data-mobile="true"]').isVisible()) return
  await page.locator('[data-slot="sidebar-trigger"]').click()
  await expect(page.locator('[data-sidebar="sidebar"][data-mobile="true"]')).toBeVisible()
}

/**
 * Open a collapsible sidebar group so its sub-links are in the DOM.
 *
 * The dashboard sidebar (`components/app-sidebar.tsx`) nests secondary links
 * (Progress Report, My Certificates, Community under People, …) inside a
 * base-ui Collapsible that only opens for the active route. A closed group
 * renders no sub-links at all, so `a[href*=…]` finds nothing until the group's
 * chevron — a button whose accessible name is the group title — is pressed.
 */
export async function openSidebarGroup(page: Page, groupLabel: string) {
  await openSidebar(page)
  const trigger = page.getByRole('button', { name: groupLabel, exact: true }).first()
  await expect(trigger).toBeVisible({ timeout: 15_000 })
  if ((await trigger.getAttribute('data-panel-open')) !== null) return
  await trigger.click()
  await expect(trigger).toHaveAttribute('data-panel-open', /.*/, { timeout: 5_000 })
}
