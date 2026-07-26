import { expect, type Page, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { LOCALE, TENANT_BASE } from './utils/constants'

// /products/new renders the one-screen quick create; the multi-step wizard
// these helpers drive lives behind ?advanced=1.
const wizardPath = `${TENANT_BASE}/${LOCALE}/dashboard/admin/products/new?advanced=1`
const quickCreatePath = `${TENANT_BASE}/${LOCALE}/dashboard/admin/products/new`
const productsPath = `${TENANT_BASE}/${LOCALE}/dashboard/admin/products`

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
  // Click the base-ui radio itself, not its wrapping FieldLabel — a label click
  // does not reliably toggle it under Playwright, which silently left the wizard
  // on the default (free) mode and starved the paid-only fields.
  const option = page.getByTestId(mode === 'free' ? 'pricing-mode-free' : 'pricing-mode-paid')
  await expect(option).toBeVisible({ timeout: 10_000 })
  await option.getByRole('radio').first().click()

  if (mode === 'paid') {
    await expect(page.getByTestId('product-creation-price')).toBeVisible({ timeout: 10_000 })
  }
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
  // Strictly the testid: an /add.*instruction/i name fallback matches the step-4
  // nav button ("After purchase — Add paid-only instructions") first, which just
  // navigates and never appends a step row.
  const addStepButton = page.getByTestId('post-registration-add-step')

  if (!(await addStepButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    return
  }

  // base-ui buttons often ignore Playwright's synthesized click; dispatch a real
  // DOM click so the step row is actually appended.
  await addStepButton.evaluate((element) => (element as HTMLElement).click())

  const stepTitle = page.getByTestId('post-registration-step-title').last()
  await expect(stepTitle).toBeVisible({ timeout: 10_000 })
  await stepTitle.fill('Join the onboarding channel')

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
  // Strictly the testid: a name-based /publish/i fallback also matches the
  // step-5 nav button ("Review — check readiness and choose draft or publish"),
  // so it used to jump steps instead of publishing, and the old success
  // assertion then matched that same wording and passed without saving anything.
  const publishButton = page.getByTestId('product-creation-publish')

  // Publish only renders on the review step — advance if we are not there yet.
  for (let step = 0; step < 4; step++) {
    if (await publishButton.isVisible({ timeout: 1_000 }).catch(() => false)) break
    await clickNext(page)
  }

  await expect(publishButton).toBeEnabled({ timeout: 10_000 })
  await publishButton.click()

  // A save redirects to the products list; anything else means it did not save.
  await expect(page.getByTestId('products-page')).toBeVisible({ timeout: 20_000 })
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

    // A free offering is a real product (price 0), so it must appear on the
    // products list the wizard redirects to — it used to persist only a course,
    // leaving this page empty and the offering with no edit route.
    await page.goto(productsPath, { timeout: 30_000 })
    await expect(
      page.getByTestId('products-page').getByText(title).first()
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/^(Free|Gratis)$/).first()).toBeVisible({ timeout: 10_000 })
  })

  test('quick create publishes a free offering that shows up as a product', async ({ page }) => {
    const title = uniqueTitle('E2E Quick Free Offering')

    await page.goto(quickCreatePath, { timeout: 30_000 })
    await page.locator('#quick-title').fill(title)

    // 'free' is the default pricing mode — publish straight away.
    await page.getByRole('button', { name: /publish|publicar/i }).first().click()

    await expect(
      page.getByTestId('products-page').getByText(title).first()
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/^(Free|Gratis)$/).first()).toBeVisible({ timeout: 10_000 })
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

    // The product card repeats the title (name + linked-course list), so scope
    // to the first match rather than tripping strict mode.
    await expect(
      page.getByTestId('products-page').getByText(title).first()
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/manual|offline/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('$99.00').first()).toBeVisible({ timeout: 10_000 })
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
