import { expect, type Page, test } from '@playwright/test'
import { loginAsAdmin, loginAsTenantStudent } from '../playwright/utils/auth'
import { LOCALE, TENANT_BASE } from '../playwright/utils/constants'

const productsPath = `${TENANT_BASE}/${LOCALE}/dashboard/admin/products`
const newProductPath = `${productsPath}/new`

function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now()}`
}

async function openNewProductWizard(page: Page) {
  await page.goto(newProductPath, { timeout: 30_000 })
  await expect(
    page.getByTestId('product-creation-wizard').or(page.getByRole('main')).first()
  ).toBeVisible({ timeout: 10_000 })
}

async function clickWizardButton(page: Page, testId: string, name: RegExp) {
  await page
    .getByTestId(testId)
    .or(page.getByRole('button', { name }))
    .or(page.getByRole('radio', { name }))
    .first()
    .click()
}

async function clickNextIfPresent(page: Page) {
  const next = page
    .getByTestId('product-creation-next')
    .or(page.getByRole('button', { name: /next|continue/i }))
    .first()

  if (await next.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await next.click()
  }
}

async function fillWizardBasics(page: Page, title: string) {
  await page
    .getByTestId('product-creation-title')
    .or(page.getByLabel(/course\/product title|title|name/i))
    .or(page.locator('input[name="title"], input[name="name"], #title, #name'))
    .first()
    .fill(title)

  const description = page
    .getByTestId('product-creation-description')
    .or(page.getByLabel(/description/i))
    .or(page.locator('textarea[name="description"], #description'))
    .first()

  if (await description.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await description.fill('Manual payment product created by the wizard E2E test')
  }
}

async function fillManualPaidPricing(page: Page, price = '99.99') {
  await clickWizardButton(page, 'pricing-mode-paid', /paid/i)

  await page
    .getByTestId('product-creation-price')
    .or(page.getByLabel(/price/i))
    .or(page.locator('input[name="price"], #price'))
    .first()
    .fill(price)

  const provider = page
    .getByTestId('product-creation-payment-provider')
    .or(page.getByRole('combobox', { name: /payment method|payment provider/i }))
    .or(page.locator('select[name="paymentProvider"], #paymentProvider'))
    .first()

  await expect(provider).toBeVisible({ timeout: 10_000 })
  const tagName = await provider.evaluate((element) => element.tagName.toLowerCase())
  if (tagName === 'select') {
    await provider.selectOption('manual')
  } else {
    await provider.click()
    await page.getByRole('option', { name: /manual|offline/i }).first().click()
  }

  await expect(page.getByText(/offline payment|manual payment|contact/i).first()).toBeVisible({
    timeout: 5_000,
  })
}

async function publishWizard(page: Page) {
  const publish = page
    .getByTestId('product-creation-publish')
    .or(page.getByRole('button', { name: /publish/i }))
    .first()

  await expect(publish).toBeEnabled({ timeout: 10_000 })
  await publish.click()
  await expect(page.getByTestId('products-page').or(page.getByText(/created|published/i)).first()).toBeVisible({
    timeout: 15_000,
  })
}

test.describe('Admin Products - Manual Payment Wizard', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000)
    await loginAsAdmin(page)
  })

  test('creates a paid product with manual payment provider', async ({ page }) => {
    const title = uniqueTitle('Manual Payment Wizard Product')

    await openNewProductWizard(page)
    await clickWizardButton(page, 'course-source-new', /create new course/i)
    await clickNextIfPresent(page)
    await fillWizardBasics(page, title)
    await clickNextIfPresent(page)
    await fillManualPaidPricing(page)
    await clickNextIfPresent(page)
    await clickNextIfPresent(page)
    await publishWizard(page)

    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/manual|offline/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('displays payment provider badge on product list', async ({ page }) => {
    await page.goto(productsPath)

    await expect(page.getByText(/manual|offline/i).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('validates required wizard fields before publish', async ({ page }) => {
    await openNewProductWizard(page)

    const publish = page
      .getByTestId('product-creation-publish')
      .or(page.getByRole('button', { name: /publish/i }))
      .first()

    if (await publish.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(publish).toBeDisabled()
      return
    }

    await clickNextIfPresent(page)
    await expect(page.getByText(/title|required|select a course/i).first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test('validates paid price is greater than 0', async ({ page }) => {
    await openNewProductWizard(page)
    await clickWizardButton(page, 'course-source-new', /create new course/i)
    await clickNextIfPresent(page)
    await fillWizardBasics(page, uniqueTitle('Invalid Price Product'))
    await clickNextIfPresent(page)
    await clickWizardButton(page, 'pricing-mode-paid', /paid/i)
    await page
      .getByTestId('product-creation-price')
      .or(page.getByLabel(/price/i))
      .or(page.locator('input[name="price"], #price'))
      .first()
      .fill('0')
    await clickNextIfPresent(page)

    await expect(page.getByText(/price greater than 0|price must be greater/i).first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test('loads existing product edit wizard with pre-filled data', async ({ page }) => {
    await page.goto(productsPath)

    const editLink = page.locator('a[href*="/products/"][href*="/edit"]').first()
    test.skip(
      !(await editLink.isVisible({ timeout: 5_000 }).catch(() => false)),
      'No editable products are available for this tenant.'
    )

    await editLink.click()
    await expect(
      page.getByTestId('product-creation-wizard').or(page.getByRole('main')).first()
    ).toBeVisible({ timeout: 10_000 })

    const titleInput = page
      .getByTestId('product-creation-title')
      .or(page.getByLabel(/course\/product title|title|name/i))
      .or(page.locator('input[name="title"], input[name="name"], #title, #name'))
      .first()

    await expect(titleInput).toBeVisible({ timeout: 10_000 })
    await expect(titleInput).not.toHaveValue('')
  })
})

test.describe('Student - Manual Payment Flow', () => {
  test('shows contact flow for manual payment products when available', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student`)

    const manualProduct = page
      .getByRole('button', { name: /contact|request info|manual payment/i })
      .or(page.getByText(/contact for payment|request info/i))
      .first()

    test.skip(
      !(await manualProduct.isVisible({ timeout: 5_000 }).catch(() => false)),
      'No manual payment product is visible for this tenant student.'
    )

    await manualProduct.click()
    await expect(page.getByText(/request payment information|payment request/i).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
