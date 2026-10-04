/**
 * The pages a visitor sees before they have an account (#716 §4).
 *
 * `loop-1-creator-publishes.spec.ts` ends on the public course page and
 * `public-entry-ctas.spec.ts` covers `/products/*`; everything else a stranger
 * can reach — the marketing home, `/pricing`, `/platform-pricing`, `/creators`,
 * `/courses`, and the Puck-rendered tenant landing page — had no spec at all.
 * They are the first thing anyone sees, they read from the database, and a
 * broken one fails quietly: an empty catalogue, a plan grid with no plans and a
 * page that bounced to `/auth/login` all render a perfectly valid 200.
 *
 * So each case here asserts three things: the response is not an error, the
 * copy comes from the catalogue **for the requested locale** (a hardcoded
 * English screen is the #678/#689 regression), and the data the page exists to
 * show is actually on it. Headings are read out of `messages/*.json` rather
 * than pasted, so a copy edit updates the test with the product instead of
 * breaking it — what is pinned is that the page rendered ITS OWN copy in the
 * right language, which is the part that regresses.
 *
 * Fixtures live on a dedicated tenant: the catalogue assertions are negative as
 * well as positive ("this school's course, not that one's"), and the seeded
 * schools are shared with a dozen other specs.
 */
import { test, expect, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import { BASE } from './utils/constants'
import { DEFAULT_TENANT } from './utils/seed-state'
import {
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  tenantBase,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000717',
  slug: 'qa-public-716',
  name: 'QA Public School 716',
  planSlug: 'e2e-unused-public-716',
}
const QA_BASE = tenantBase(QA.slug)

const PUBLISHED_COURSE = '[E2E] #716 Published Course'
const DRAFT_COURSE = '[E2E] #716 Draft Course'
const TENANT_PLAN = '[E2E] #716 School Plan'
const LANDING_HEADING = 'Welcome to the #716 landing page'

const catalogue = { en, es } as const
type Locale = keyof typeof catalogue

let publishedCourseId: number

/**
 * Still on the school's own host. `proxy.ts` caches an unknown slug for 60s and
 * sends it to the platform root, which renders a perfectly good marketing page
 * — so a tenant page that quietly lost its tenant otherwise passes every
 * "is the text there" assertion by being a different page entirely.
 */
async function expectStillOnTenant(page: Page) {
  expect(page.url()).toContain(QA.slug)
}

/** A page that rendered the error boundary is a failure, not a 200. */
async function expectNoErrorBoundary(page: Page) {
  await expect(page.locator('text=Application error')).toHaveCount(0)
  await expect(page.getByTestId('error-boundary')).toHaveCount(0)
}

async function seedLandingPage(admin: SupabaseClient, isPublished: boolean) {
  // Puck's `Render` does NOT backfill `defaultProps` (#429), so the seeded
  // block carries every prop the renderer reads.
  const puckData = {
    root: { props: { title: 'QA Public School 716' } },
    content: [
      {
        type: 'Heading',
        props: {
          id: 'Heading-716',
          text: LANDING_HEADING,
          level: 'h1',
          alignment: 'center',
          color: '',
          fontSize: '3rem',
          fontWeight: '700',
        },
      },
    ],
    zones: {},
  }
  const { error } = await admin.from('landing_pages').upsert(
    {
      tenant_id: QA.id,
      slug: 'home',
      title: 'Home',
      puck_data: puckData,
      is_published: isPublished,
    },
    { onConflict: 'tenant_id,slug' },
  )
  if (error) throw new Error(`could not seed the landing page: ${error.message}`)
}

async function destroyFixtures(admin: SupabaseClient) {
  await admin.from('landing_pages').delete().eq('tenant_id', QA.id)
  await admin.from('plans').delete().eq('tenant_id', QA.id)
  await admin.from('products').delete().eq('tenant_id', QA.id)
  await destroyQaTenant(admin, QA)
}

test.describe.configure({ mode: 'serial' })

test.describe('public marketing pages (#716)', () => {
  test.beforeAll(async () => {
    const admin = getAdmin()
    await destroyFixtures(admin)
    await createQaTenant(admin, QA, 'pro')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')

    const { data: course, error: courseError } = await admin
      .from('courses')
      .insert([
        { title: PUBLISHED_COURSE, tenant_id: QA.id, author_id: SEEDED.owner.id, status: 'published', description: 'Visible to strangers (#716)' },
        { title: DRAFT_COURSE, tenant_id: QA.id, author_id: SEEDED.owner.id, status: 'draft', description: 'Must never reach the catalogue (#716)' },
      ])
      .select('course_id, status')
    if (courseError) throw new Error(`could not insert the courses: ${courseError.message}`)
    publishedCourseId = (course ?? []).find((c) => c.status === 'published')!.course_id as number

    const { error: planError } = await admin.from('plans').insert({
      plan_name: TENANT_PLAN,
      tenant_id: QA.id,
      price: 25,
      currency: 'usd',
      duration_in_days: 30,
      description: 'School plan fixture (#716)',
    })
    if (planError) throw new Error(`could not insert the plan: ${planError.message}`)

    const { error: productError } = await admin.from('products').insert({
      name: '[E2E] #716 School Product',
      description: 'Shown on the fallback school landing page (#716)',
      price: 40,
      currency: 'usd',
      status: 'active',
      tenant_id: QA.id,
    })
    if (productError) throw new Error(`could not insert the product: ${productError.message}`)
  })

  test.afterAll(async () => {
    await destroyFixtures(getAdmin())
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — fixtures are shared DB state')
  })

  for (const locale of ['en', 'es'] as Locale[]) {
    test(`the marketing home renders its own copy in /${locale}`, async ({ page }) => {
      const hero = catalogue[locale].home.hero
      const response = await page.goto(`${BASE}/${locale}`, { waitUntil: 'domcontentloaded' })

      expect(response?.status()).toBeLessThan(400)
      // Still anonymous: an entry point that bounces to the login wall is the
      // bug #719 fixed on `/products`, and nothing pinned it for the home page.
      expect(page.url()).not.toContain('/auth/login')
      await expect(page.getByRole('heading', { name: new RegExp(hero.titleLead, 'i') }).first()).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(hero.titleHighlight, { exact: false }).first()).toBeVisible()
      await expectNoErrorBoundary(page)
    })

    test(`/creators reads ${locale === 'en' ? 'English' : 'Spanish'} in /${locale}`, async ({ page }) => {
      const creators = catalogue[locale].creators
      const response = await page.goto(`${BASE}/${locale}/creators`, { waitUntil: 'domcontentloaded' })

      expect(response?.status()).toBeLessThan(400)
      await expect(page.getByRole('heading', { name: creators.heroTitle }).first()).toBeVisible({ timeout: 20_000 })
      await expectNoErrorBoundary(page)
    })
  }

  test('/platform-pricing lists every active platform plan', async ({ page }) => {
    const admin = getAdmin()
    const { data: plans, error } = await admin
      .from('platform_plans')
      .select('name, slug')
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw new Error(`could not read the plans: ${error.message}`)
    expect(plans?.length ?? 0).toBeGreaterThan(0)

    const response = await page.goto(`${BASE}/en/platform-pricing`, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(400)
    expect(page.url()).not.toContain('/auth/login')

    // The page sells the plans; a plan grid built from an empty read still
    // renders its headings, so the plan NAMES are what is asserted.
    for (const plan of plans ?? []) {
      await expect(page.getByText(plan.name, { exact: false }).first()).toBeVisible({ timeout: 20_000 })
    }
    await expectNoErrorBoundary(page)
  })

  test('/courses shows this school’s published courses and nobody else’s', async ({ page }) => {
    const response = await page.goto(`${QA_BASE}/en/courses`, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(400)
    expect(page.url()).not.toContain('/auth/login')
    await expectStillOnTenant(page)

    await expect(page.getByText(PUBLISHED_COURSE).first()).toBeVisible({ timeout: 20_000 })
    // Draft courses are not public, and neither is another school's catalogue.
    await expect(page.getByText(DRAFT_COURSE)).toHaveCount(0)

    const admin = getAdmin()
    const { data: otherSchoolCourse } = await admin
      .from('courses')
      .select('title')
      .eq('tenant_id', DEFAULT_TENANT)
      .eq('status', 'published')
      .limit(1)
      .maybeSingle()
    if (otherSchoolCourse?.title) {
      await expect(page.getByText(otherSchoolCourse.title, { exact: true })).toHaveCount(0)
    }
    await expectNoErrorBoundary(page)
  })

  test('/courses reads Spanish in /es', async ({ page }) => {
    await page.goto(`${QA_BASE}/es/courses`, { waitUntil: 'domcontentloaded' })
    await expectStillOnTenant(page)
    await expect(page.getByText(es.coursesCatalog.title).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(en.coursesCatalog.title, { exact: true })).toHaveCount(0)
  })

  test('/pricing offers the school’s own plans to a stranger', async ({ page }) => {
    const response = await page.goto(`${QA_BASE}/en/pricing`, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(400)
    expect(page.url()).not.toContain('/auth/login')

    await expectStillOnTenant(page)
    await expect(page.getByTestId('pricing-title')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(TENANT_PLAN).first()).toBeVisible()
    await expectNoErrorBoundary(page)
  })

  test('a published Puck landing page replaces the default school page', async ({ page }) => {
    await seedLandingPage(getAdmin(), true)

    const response = await page.goto(`${QA_BASE}/en`, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(400)

    await expectStillOnTenant(page)
    await expect(page.getByRole('heading', { name: LANDING_HEADING })).toBeVisible({ timeout: 20_000 })
    await expectNoErrorBoundary(page)
  })

  test('an unpublished one falls back to the school landing page', async ({ page }) => {
    await seedLandingPage(getAdmin(), false)

    await page.goto(`${QA_BASE}/en`, { waitUntil: 'domcontentloaded' })

    await expectStillOnTenant(page)
    await expect(page.getByRole('heading', { name: QA.name }).first()).toBeVisible({ timeout: 20_000 })
    // The draft page's content must not leak onto the public site.
    await expect(page.getByText(LANDING_HEADING)).toHaveCount(0)
    await expectNoErrorBoundary(page)
  })

  test('the public course page is reachable without an account', async ({ page }) => {
    const response = await page.goto(`${QA_BASE}/en/courses/${publishedCourseId}`, { waitUntil: 'domcontentloaded' })

    expect(response?.status()).toBeLessThan(400)
    expect(page.url()).not.toContain('/auth/login')
    await expectStillOnTenant(page)
    await expect(page.getByText(PUBLISHED_COURSE).first()).toBeVisible({ timeout: 20_000 })
    await expectNoErrorBoundary(page)
  })
})
