import { test, expect } from '@playwright/test'
import { loginAsStudent } from './utils/auth'
import { BASE } from './utils/constants'
import en from '../../messages/en.json'
import es from '../../messages/es.json'

for (const { locale, labels } of [
  { locale: 'en', labels: en.components.profileForm },
  { locale: 'es', labels: es.components.profileForm },
]) {
  test(`profile edits survive failed saves, successful saves and reload (${locale})`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await loginAsStudent(page)
    await page.goto(`${BASE}/${locale}/dashboard/student/profile`)
    const name = page.getByLabel(labels.fullName, { exact: true })
    const username = page.getByLabel(labels.username, { exact: true })
    const website = page.getByLabel(labels.website, { exact: true })
    const bio = page.getByLabel(labels.bio, { exact: true })
    const save = page.getByRole('button', { name: labels.save, exact: true })
    await expect(name).toBeVisible()
    const original = {
      name: await name.inputValue(), username: await username.inputValue(),
      website: await website.inputValue(), bio: await bio.inputValue(),
    }
    const suffix = Date.now()
    const updatedName = `Profile QA ${suffix}`
    const actionUrl = `**/${locale}/dashboard/student/profile`
    let saved = false
    try {
      await name.fill(updatedName)
      await username.fill(`profile_qa_${suffix}`)
      await website.fill('https://example.com/profile-qa')
      await bio.fill('Profile persistence check')
      await page.screenshot({ path: testInfo.outputPath('before-save.png'), fullPage: true })
      // Deployment/network failures must leave the entire draft available to retry.
      await page.route(actionUrl, async route => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporarily unavailable' })
        } else {
          await route.continue()
        }
      })
      await save.click()
      await expect(page.getByRole('alert').filter({ hasText: labels.error }).first()).toBeVisible()
      await expect(name).toHaveValue(updatedName)
      await expect(username).toHaveValue(`profile_qa_${suffix}`)
      await expect(website).toHaveValue('https://example.com/profile-qa')
      await expect(bio).toHaveValue('Profile persistence check')
      await page.unroute(actionUrl)
      await save.click()
      await expect(page.getByRole('status').filter({ hasText: labels.success }).first()).toBeVisible({ timeout: 20_000 })
      saved = true
      await expect(name).toHaveValue(updatedName)
      await expect(page.getByRole('heading', { name: updatedName, exact: true })).toBeVisible({ timeout: 20_000 })
      await page.screenshot({ path: testInfo.outputPath('after-save.png'), fullPage: true })
      await page.reload()
      await expect(name).toHaveValue(updatedName)
      await expect(username).toHaveValue(`profile_qa_${suffix}`)
      await expect(website).toHaveValue('https://example.com/profile-qa')
      await expect(bio).toHaveValue('Profile persistence check')
    } finally {
      await page.unroute(actionUrl)
      if (saved) {
        await name.fill(original.name)
        await username.fill(original.username)
        await website.fill(original.website)
        await bio.fill(original.bio)
        await save.click()
        await expect(page.getByRole('status').filter({ hasText: labels.success }).first()).toBeVisible({ timeout: 20_000 })
        await page.reload()
        await expect(name).toHaveValue(original.name)
        await expect(username).toHaveValue(original.username)
      }
    }
  })
}
