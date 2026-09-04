import { expect, type Page } from '@playwright/test'

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
  const trigger = page.getByRole('button', { name: groupLabel, exact: true }).first()
  await expect(trigger).toBeVisible({ timeout: 15_000 })
  if ((await trigger.getAttribute('data-panel-open')) !== null) return
  await trigger.click()
  await expect(trigger).toHaveAttribute('data-panel-open', /.*/, { timeout: 5_000 })
}
