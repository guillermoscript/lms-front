import { expect, type Page, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { LOCALE, TENANT_BASE } from './utils/constants'

const wizardPath = `${TENANT_BASE}/${LOCALE}/dashboard/admin/products/new`

function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now()}`
}

function byTestIdOrRole(page: Page, testId: string, role: 'button' | 'radio', name: RegExp) {
  return page.getByTestId(testId).or(page.getByRole(role, { name })).first()
}

async function openWizard(page: Page) {
  await page.goto(wizardPath, { timeout: 30_000 })
  await expect(
    page.getByTestId('product-creation-wizard').or(page.getByRole('main')).first()
  ).toBeVisible({ timeout: 10_000 })
}

async function clickNext(page: Page) {
  const nextButton = page
    .getByTestId('product-creation-next')
    .or(page.getByRole('button', { name: /next|continue/i }))
    .first()

  if (await nextButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await nextButton.click()
  }
}

async function fillBasics(page: Page, title: string) {
  const titleInput = page
    .getByTestId('product-creation-title')
    .or(page.getByLabel(/course\/product title|title|name/i))
    .or(page.locator('input[name="title"], input[name="name"], #title, #name'))
    .first()
  await titleInput.fill(title)

  const descriptionInput = page
    .getByTestId('product-creation-description')
    .or(page.getByLabel(/description/i))
    .or(page.locator('textarea[name="description"], #description'))
    .first()

  if (await descriptionInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await descriptionInput.fill(`${title} description`)
  }
}

async function chooseNewCourse(page: Page) {
  await byTestIdOrRole(page, 'course-source-new', 'button', /create new course/i)
    .or(page.getByRole('radio', { name: /create new course/i }))
    .first()
    .click()
}

async function chooseExistingCourse(page: Page) {
  await byTestIdOrRole(page, 'course-source-existing', 'button', /use existing course/i)
    .or(page.getByRole('radio', { name: /use existing course/i }))
    .first()
    .click()

  const coursePicker = page
    .getByTestId('existing-course-select')
    .or(page.getByRole('combobox', { name: /course/i }))
    .or(page.locator('select[name="existingCourseId"], input[placeholder*="course" i]'))
    .first()

  await expect(coursePicker).toBeVisible({ timeout: 10_000 })

  const tagName = await coursePicker.evaluate((element) => element.tagName.toLowerCase())
  if (tagName === 'select') {
    const options = await coursePicker.locator('option').evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter(Boolean)
    )
    test.skip(options.length === 0, 'No existing course options are available for this tenant.')
    await coursePicker.selectOption(options[0])
    return
  }

  await coursePicker.click()
  const option = page
    .getByRole('option')
    .or(page.locator('[role="listbox"] [role="option"], [data-testid="existing-course-option"]'))
    .first()
  test.skip(
    !(await option.isVisible({ timeout: 5_000 }).catch(() => false)),
    'No existing course options are available for this tenant.'
  )
  await option.click()
}

async function choosePricing(page: Page, mode: 'free' | 'paid') {
  await byTestIdOrRole(
    page,
    mode === 'free' ? 'pricing-mode-free' : 'pricing-mode-paid',
    'button',
    mode === 'free' ? /free/i : /paid/i
  )
    .or(page.getByRole('radio', { name: mode === 'free' ? /free/i : /paid/i }))
    .first()
    .click()
}

async function fillPaidPricing(page: Page, price: string, provider = /manual|offline/i) {
  await choosePricing(page, 'paid')

  const priceInput = page
    .getByTestId('product-creation-price')
    .or(page.getByLabel(/price/i))
    .or(page.locator('input[name="price"], #price'))
    .first()
  await priceInput.fill(price)

  const currencySelect = page
    .getByTestId('product-creation-currency')
    .or(page.getByRole('combobox', { name: /currency/i }))
    .or(page.locator('select[name="currency"], #currency'))
    .first()

  if (await currencySelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const tagName = await currencySelect.evaluate((element) => element.tagName.toLowerCase())
    if (tagName === 'select') {
      await currencySelect.selectOption('usd')
    } else {
      await currencySelect.click()
      await page.getByRole('option', { name: /usd|\$/i }).first().click()
    }
  }

  const providerSelect = page
    .getByTestId('product-creation-payment-provider')
    .or(page.getByRole('combobox', { name: /payment method|payment provider/i }))
    .or(page.locator('select[name="paymentProvider"], #paymentProvider'))
    .first()

  if (await providerSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const tagName = await providerSelect.evaluate((element) => element.tagName.toLowerCase())
    if (tagName === 'select') {
      await providerSelect.selectOption(/manual/.test(provider.source) ? 'manual' : 'stripe')
    } else {
      await providerSelect.click()
      await page.getByRole('option', { name: provider }).first().click()
    }
  }
}

async function addPostRegistrationStep(page: Page) {
  const addStepButton = page
    .getByTestId('post-registration-add-step')
    .or(page.getByRole('button', { name: /add.*step|add.*instruction/i }))
    .first()

  if (!(await addStepButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    return
  }

  await addStepButton.click()
  await page
    .getByTestId('post-registration-step-title')
    .or(page.getByLabel(/step title|instruction title|title/i))
    .last()
    .fill('Join the onboarding channel')

  const urlInput = page
    .getByTestId('post-registration-step-url')
    .or(page.getByLabel(/url|link/i))
    .or(page.locator('input[type="url"], input[name*="url" i]'))
    .last()

  if (await urlInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await urlInput.fill('https://example.com/onboarding')
  }
}

async function publishWizard(page: Page) {
  const publishButton = page
    .getByTestId('product-creation-publish')
    .or(page.getByRole('button', { name: /publish/i }))
    .first()

  await expect(publishButton).toBeEnabled({ timeout: 10_000 })
  await publishButton.click()

  await expect(
    page.getByText(/published|created|saved/i).or(page.getByTestId('products-page')).first()
  ).toBeVisible({ timeout: 15_000 })
}

test.describe('Admin Product/Course Creation Wizard', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000)
    await loginAsAdmin(page)
  })

  test('creates and publishes a free course without paid product setup', async ({ page }) => {
    const title = uniqueTitle('E2E Free Wizard Course')

    await openWizard(page)
    await chooseNewCourse(page)
    await clickNext(page)
    await fillBasics(page, title)
    await clickNext(page)
    await choosePricing(page, 'free')
    await clickNext(page)

    await publishWizard(page)

    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 })
  })

  test('creates a paid offering for a new course with manual payment instructions', async ({
    page,
  }) => {
    const title = uniqueTitle('E2E Paid Wizard Course')

    await openWizard(page)
    await chooseNewCourse(page)
    await clickNext(page)
    await fillBasics(page, title)
    await clickNext(page)
    await fillPaidPricing(page, '99')
    await clickNext(page)
    await addPostRegistrationStep(page)
    await clickNext(page)
    await publishWizard(page)

    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/manual|offline/i)).toBeVisible({ timeout: 10_000 })
  })

  test('creates a paid offering from an existing tenant course', async ({ page }) => {
    await openWizard(page)
    await chooseExistingCourse(page)
    await clickNext(page)

    const mirroredTitle = page
      .getByTestId('product-creation-title')
      .or(page.getByLabel(/course\/product title|title|name/i))
      .or(page.locator('input[name="title"], input[name="name"], #title, #name'))
      .first()

    await expect(mirroredTitle).toBeVisible({ timeout: 10_000 })
    await expect(mirroredTitle).not.toHaveValue('', { timeout: 10_000 })

    await clickNext(page)
    await fillPaidPricing(page, '49')
    await clickNext(page)
    await addPostRegistrationStep(page)
    await clickNext(page)
    await publishWizard(page)

    await expect(page.getByTestId('products-page').or(page.getByText(/products/i)).first()).toBeVisible({
      timeout: 15_000,
    })
  })
})
