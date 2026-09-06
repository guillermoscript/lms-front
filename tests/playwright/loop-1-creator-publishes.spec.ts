/**
 * Loop 1 — a creator creates a school, publishes a course with a lesson and
 * opens its public page (#670, part of #682).
 *
 * The first thing every creator does, walked end to end through the real UI:
 *
 *   1. Anonymous on the bare platform domain → /create-school → sign up →
 *      name the school → land on the new subdomain's /dashboard/admin.
 *   2. Checklist "Create your first course" → /dashboard/admin/courses/new →
 *      quick create as a draft → course editor.
 *   3. Add the first lesson with block content (a Text block and a Callout,
 *      which serialises to an MDX component) → publish the lesson.
 *   4. Publish the course from its settings page (base-ui Select → Update).
 *   5. Anonymous visitor opens https://<slug>/courses/<id>: title, lesson
 *      list, Free badge and the enroll CTA. /courses lists the card. The same
 *      id 404s on another tenant's subdomain.
 *   6. The checklist reports the first course as done.
 *
 * A second test walks steps 1 and 5 in Spanish.
 *
 * Every run owns a fresh tenant + creator (`loop1-<runId>`), so the seeded
 * tenants are never touched and the spec is safe under CI's fullyParallel
 * shards. `afterAll` removes everything the run created; `beforeAll` sweeps
 * whatever an aborted earlier run may have left behind.
 */
import { test, expect, type Browser, type Locator, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BASE, TENANT_BASE } from './utils/constants'
import { getServiceRoleClient } from './utils/seed-state'
import { tenantBase } from './utils/plan-gate-fixtures'

test.describe.configure({ mode: 'serial' })

const PASSWORD = 'password123'
const RUN_ID = Date.now().toString(36)
const RUN_PREFIX = `loop1-${RUN_ID}`
const STALE_AFTER_MS = 60 * 60 * 1000

interface Creator {
  slug: string
  email: string
  schoolName: string
}

/** One tenant per attempt: CI retries would otherwise collide on the slug. */
function creatorFor(variant: 'en' | 'es', retry: number): Creator {
  const slug = `${RUN_PREFIX}-${variant}${retry ? `-r${retry}` : ''}`
  return {
    slug,
    email: `${slug}@e2etest.com`,
    schoolName: `Loop 1 ${variant.toUpperCase()} ${RUN_ID}`,
  }
}

/* ------------------------------------------------------------------ */
/*  UI helpers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fill a React-controlled input and prove the value survived hydration —
 * the same trap `utils/auth.ts` documents for the login form.
 */
async function fillStable(field: Locator, value: string) {
  await fillAllStable([[field, value]])
}

/**
 * Fill several controlled inputs of one form together. Hydration wipes every
 * field of the form at once, so checking them one by one can pass on the
 * first field and then lose it while the next one is being typed.
 */
async function fillAllStable(fields: Array<[Locator, string]>) {
  for (const [field] of fields) await field.waitFor({ state: 'visible', timeout: 30_000 })
  const page = fields[0][0].page()
  // React stamps `__reactProps$…` on a node when it hydrates it; a value typed
  // before that never reaches component state, however long it stays on screen.
  await expect
    .poll(
      () =>
        fields[0][0].evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))),
      { timeout: 60_000, intervals: [250, 500, 1000] },
    )
    .toBe(true)
  await expect
    .poll(
      async () => {
        for (const [field, value] of fields) await field.fill(value)
        await page.waitForTimeout(750)
        const values = await Promise.all(fields.map(([field]) => field.inputValue()))
        return values.every((v, i) => v === fields[i][1])
      },
      { timeout: 45_000, intervals: [500, 1000] },
    )
    .toBe(true)
}

/**
 * base-ui Buttons intermittently swallow a Playwright click; press again
 * until the page shows the expected result.
 */
async function clickUntil(
  button: Locator,
  arrived: () => Promise<boolean>,
  { attempts = 2, settleMs = 45_000 }: { attempts?: number; settleMs?: number } = {},
) {
  const page = button.page()
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await arrived()) return
    await button.click().catch(() => undefined)
    // Poll rather than sleep: a click that took should not wait out the budget.
    const deadline = Date.now() + settleMs
    while (Date.now() < deadline) {
      if (await arrived()) return
      await page.waitForTimeout(250)
    }
  }
  if (!(await arrived())) {
    throw new Error(`clicking ${await button.evaluate((el) => el.textContent?.trim())} never took`)
  }
}

/**
 * Steps 1: anonymous on the bare platform domain, sign up and name the
 * school. Resolves once the new tenant's admin dashboard is on screen.
 *
 * The flow finishes with a hard redirect to `<slug>.<NEXT_PUBLIC_PLATFORM_DOMAIN>`.
 * Locally that env var is often portless (`lvh.me`), which sends the browser
 * to port 80 where nothing listens; CI carries the port (`lvh.me:3000`). Wait
 * for the subdomain hop either way, then open the dashboard on the suite's
 * own base so both setups reach the same assertion.
 */
async function createSchool(page: Page, locale: 'en' | 'es', creator: Creator) {
  await page.goto(`${BASE}/${locale}/create-school`, { waitUntil: 'domcontentloaded' })

  await fillAllStable([
    [page.locator('#owner-name'), 'Loop One Creator'],
    [page.locator('#email'), creator.email],
    [page.locator('#password'), PASSWORD],
  ])

  const schoolName = page.getByTestId('create-school-name')
  await clickUntil(
    page.getByRole('button', { name: /create account/i }),
    () => schoolName.isVisible(),
  )

  await fillAllStable([
    [schoolName, creator.schoolName],
    [page.getByTestId('create-school-slug'), creator.slug],
  ])

  const submit = page.getByTestId('create-school-submit')
  await expect(submit).toBeEnabled()
  // The navigation request is issued even where the port is wrong and the
  // connection is refused, so it is the one signal both setups share.
  const hop = page.waitForRequest(
    (req) => req.isNavigationRequest() && new URL(req.url()).hostname.startsWith(`${creator.slug}.`),
    { timeout: 45_000 },
  )
  await submit.click()
  const hopUrl = new URL((await hop).url())
  expect(hopUrl.pathname, 'the flow must hand off to the new subdomain dashboard').toMatch(
    /\/dashboard\/admin$/,
  )

  await page.goto(`${tenantBase(creator.slug)}/${locale}/dashboard/admin`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page).toHaveURL(new RegExp(`//${creator.slug}\\..*/${locale}/dashboard/admin`))
  await expect(page.getByTestId('admin-dashboard')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => localStorage.setItem('tours-disabled', 'true'))
}

/** The anonymous public course page: what a prospective student sees. */
async function openAnonymously(browser: Browser, url: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  return { context, page, status: response?.status() ?? 0 }
}

/* ------------------------------------------------------------------ */
/*  Database helpers                                                   */
/* ------------------------------------------------------------------ */

async function findUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 1000) return null
    page += 1
  }
}

/** Everything one loop-1 tenant owns, then the tenant and its creator. */
async function destroyLoopTenant(admin: SupabaseClient, slug: string, email: string) {
  const failures: string[] = []
  const run = async (label: string, op: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await op()
    if (error) failures.push(`${label}: ${error.message}`)
  }

  const { data: tenant } = await admin.from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (tenant) {
    const tenantId = tenant.id as string
    const { data: courses } = await admin.from('courses').select('course_id').eq('tenant_id', tenantId)
    const courseIds = (courses ?? []).map((c) => c.course_id as number)
    const { data: products } = await admin.from('products').select('product_id').eq('tenant_id', tenantId)
    const productIds = (products ?? []).map((p) => p.product_id as number)

    if (courseIds.length) {
      await run('lessons', () => admin.from('lessons').delete().in('course_id', courseIds))
      await run('product_courses', () => admin.from('product_courses').delete().in('course_id', courseIds))
    }
    if (productIds.length) {
      await run('product_courses(products)', () => admin.from('product_courses').delete().in('product_id', productIds))
    }
    await run('entitlements', () => admin.from('entitlements').delete().eq('tenant_id', tenantId))
    await run('enrollments', () => admin.from('enrollments').delete().eq('tenant_id', tenantId))
    await run('transactions', () => admin.from('transactions').delete().eq('tenant_id', tenantId))
    await run('products', () => admin.from('products').delete().eq('tenant_id', tenantId))
    await run('courses', () => admin.from('courses').delete().eq('tenant_id', tenantId))
    await run('revenue_splits', () => admin.from('revenue_splits').delete().eq('tenant_id', tenantId))
    await run('tenant_users', () => admin.from('tenant_users').delete().eq('tenant_id', tenantId))
    await run('tenant_settings', () => admin.from('tenant_settings').delete().eq('tenant_id', tenantId))
    await run('tenants', () => admin.from('tenants').delete().eq('id', tenantId))
  }

  const userId = await findUserId(admin, email)
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) failures.push(`deleteUser: ${error.message}`)
  }

  if (failures.length) throw new Error(`cleanup of ${slug} left rows behind:\n${failures.join('\n')}`)
}

/** Tenants and creators an aborted earlier run may have left behind. */
async function sweepStaleRuns(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const { data: stale } = await admin
    .from('tenants')
    .select('slug')
    .like('slug', 'loop1-%')
    .lt('created_at', cutoff)
  for (const t of stale ?? []) {
    await destroyLoopTenant(admin, t.slug as string, `${t.slug}@e2etest.com`).catch((e) =>
      console.warn(`stale loop-1 tenant ${t.slug}: ${(e as Error).message}`),
    )
  }
}

async function readCourse(admin: SupabaseClient, courseId: number) {
  const { data, error } = await admin
    .from('courses')
    .select('course_id, title, status, tenant_id')
    .eq('course_id', courseId)
    .single()
  if (error) throw new Error(`readCourse: ${error.message}`)
  return data
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

const created: Creator[] = []

test.beforeAll(async () => {
  await sweepStaleRuns(getServiceRoleClient())
})

test.afterAll(async () => {
  const admin = getServiceRoleClient()
  for (const c of created) await destroyLoopTenant(admin, c.slug, c.email)
})

test('a creator signs up, creates a school, publishes a course with a lesson and its public page shows it', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(600_000)
  const admin = getServiceRoleClient()
  const creator = creatorFor('en', testInfo.retry)
  created.push(creator)
  const base = tenantBase(creator.slug)
  const courseTitle = `Loop 1 Course ${RUN_ID}`
  const lessonTitle = `Lesson one ${RUN_ID}`
  const lessonText = `Welcome to lesson one of ${courseTitle}.`
  const calloutText = `Remember to take notes ${RUN_ID}.`
  let courseId = 0

  await test.step('1. sign up and create the school', async () => {
    await createSchool(page, 'en', creator)

    // The tenant exists with this creator as its admin.
    const { data: tenant } = await admin.from('tenants').select('id, name').eq('slug', creator.slug).single()
    expect(tenant?.name).toBe(creator.schoolName)
    const userId = await findUserId(admin, creator.email)
    const { data: membership } = await admin
      .from('tenant_users')
      .select('role, status')
      .eq('tenant_id', tenant!.id)
      .eq('user_id', userId!)
      .single()
    expect(membership).toEqual({ role: 'admin', status: 'active' })

    // The checklist promotes the first course as the next action.
    const next = page.getByTestId('onboarding-next-step')
    await expect(next).toBeVisible({ timeout: 15_000 })
    await expect(next).toContainText('Create your first course')
  })

  await test.step('2. checklist → quick create a draft course', async () => {
    // The card's CTA is a base-ui Button rendered as an anchor (role=button).
    await clickUntil(
      page.getByTestId('onboarding-next-step').locator('a[href]').first(),
      async () => /\/dashboard\/admin\/courses\/new/.test(page.url()),
    )
    await expect(page).toHaveURL(/\/dashboard\/admin\/courses\/new/, { timeout: 20_000 })
    await expect(page.getByTestId('admin-new-course-page')).toBeVisible()

    await fillStable(page.locator('#quick-title'), courseTitle)
    // Draft on purpose: publishing is its own step (4) through the settings page.
    // One creation click per attempt; a long settle so a slow server action
    // never gets a second, duplicating click.
    await clickUntil(
      page.getByRole('button', { name: /save as draft/i }),
      async () => /\/dashboard\/teacher\/courses\/\d+/.test(page.url()),
      { attempts: 2, settleMs: 30_000 },
    )
    await expect(page).toHaveURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 30_000 })
    courseId = Number(page.url().match(/courses\/(\d+)/)![1])

    const course = await readCourse(admin, courseId)
    expect(course.title).toBe(courseTitle)
    expect(course.status).toBe('draft')
  })

  await test.step('3. add the first lesson with a Text block and a Callout, publish it', async () => {
    await clickUntil(
      page.getByRole('link', { name: /add (your first )?lesson/i }).first(),
      async () => /\/lessons\/new/.test(page.url()),
    )
    await expect(page).toHaveURL(/\/lessons\/new/, { timeout: 20_000 })

    await fillStable(page.getByPlaceholder(/introduction to variables/i), lessonTitle)
    const addBlock = page.getByRole('button', { name: /^add block$/i })
    await clickUntil(page.getByRole('button', { name: /write content/i }), () =>
      addBlock.first().isVisible(),
    )

    // Empty editor: the dashed "Add block" palette trigger.
    const textOption = page.getByRole('button', { name: /^Text\b/ })
    await clickUntil(addBlock.first(), () => textOption.isVisible())
    const textArea = page.getByPlaceholder(/write your text here/i)
    await clickUntil(textOption, () => textArea.isVisible())
    await fillStable(textArea, lessonText)

    // A second block through the inline "+" after the first one.
    const calloutOption = page.getByRole('button', { name: /^Callout\b/ })
    await clickUntil(addBlock.last(), () => calloutOption.isVisible())
    const calloutArea = page.getByPlaceholder(/callout content/i)
    await clickUntil(calloutOption, () => calloutArea.isVisible())
    await fillStable(calloutArea, calloutText)

    // Publishing a lesson returns to the course curriculum (a draft save
    // would stay on the lesson instead).
    const backOnCourse = new RegExp(`/dashboard/teacher/courses/${courseId}$`)
    await clickUntil(
      page.getByRole('button', { name: /^publish$/i }),
      async () => backOnCourse.test(page.url()),
      { attempts: 2, settleMs: 30_000 },
    )
    await expect(page).toHaveURL(backOnCourse, { timeout: 30_000 })
    await expect(page.getByText(lessonTitle)).toBeVisible({ timeout: 15_000 })

    const { data: lessons } = await admin
      .from('lessons')
      .select('title, status, content')
      .eq('course_id', courseId)
    expect(lessons).toHaveLength(1)
    expect(lessons![0].title).toBe(lessonTitle)
    expect(lessons![0].status).toBe('published')
    expect(lessons![0].content).toContain(lessonText)
    expect(lessons![0].content).toMatch(/<Callout[\s>]/)
    expect(lessons![0].content).toContain(calloutText)
  })

  await test.step('4. publish the course from its settings', async () => {
    await page.goto(`${base}/en/dashboard/teacher/courses/${courseId}/settings`, {
      waitUntil: 'domcontentloaded',
    })
    const status = page.locator('#status')
    await expect(status).toBeVisible({ timeout: 20_000 })
    // The option labels are the status hints today (see the ux gap linked
    // from #670); match the one that describes "published".
    const publishedOption = page.getByRole('option', { name: /visible to students/i })
    await clickUntil(status, () => publishedOption.isVisible())
    await clickUntil(publishedOption, async () => !(await publishedOption.isVisible()))
    await clickUntil(
      page.locator('button[type="submit"]'),
      async () => (await readCourse(admin, courseId)).status === 'published',
      { attempts: 3, settleMs: 15_000 },
    )
    expect((await readCourse(admin, courseId)).status).toBe('published')
  })

  await test.step('5. the public course page and catalog, anonymously', async () => {
    const { context, page: anon, status } = await openAnonymously(
      browser,
      `${base}/en/courses/${courseId}`,
    )
    try {
      expect(status).toBe(200)
      await expect(anon.getByRole('heading', { level: 1, name: courseTitle })).toBeVisible({
        timeout: 20_000,
      })
      await clickUntil(anon.getByRole('button', { name: /all lessons/i }), () =>
        anon.getByText(lessonTitle).isVisible(),
      )
      await expect(anon.getByText(lessonTitle)).toBeVisible()
      await expect(anon.getByText('Free', { exact: true }).first()).toBeVisible()

      const cta = anon.getByRole('link', { name: /enroll for free/i })
      await expect(cta).toBeVisible()
      await expect(cta).toHaveAttribute('href', /\/auth\/login\?next=/)

      await anon.goto(`${base}/en/courses`, { waitUntil: 'domcontentloaded' })
      const card = anon.getByRole('link', { name: new RegExp(courseTitle) })
      await expect(card).toBeVisible({ timeout: 20_000 })
      await expect(card).toContainText('Free')
      await expect(card).toContainText('1 lessons')

      // Another school's subdomain never sees it. The route streams behind
      // `loading.tsx`, so the shell is a 200 and the not-found renders inside it.
      await anon.goto(`${TENANT_BASE}/en/courses/${courseId}`, { waitUntil: 'domcontentloaded' })
      await expect(anon.getByRole('heading', { name: /page not found/i })).toBeVisible({
        timeout: 20_000,
      })
      await expect(anon.getByRole('heading', { level: 1, name: courseTitle })).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  await test.step('6. the checklist reports the first course as done', async () => {
    await page.goto(`${base}/en/dashboard/admin`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('admin-dashboard')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('onboarding-milestone')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('onboarding-next-step')).not.toContainText(
      'Create your first course',
    )
    await expect(
      page.getByLabel('Completed steps').getByText('Create your first course'),
    ).toBeVisible()
  })
})

test('en español: crea la escuela y la página pública del curso se ve en español', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(400_000)
  const admin = getServiceRoleClient()
  const creator = creatorFor('es', testInfo.retry)
  created.push(creator)
  const base = tenantBase(creator.slug)
  const courseTitle = `Curso Loop 1 ${RUN_ID}`
  const lessonTitle = `Lección uno ${RUN_ID}`
  let courseId = 0

  await test.step('1. registro y creación de la escuela en /es', async () => {
    await createSchool(page, 'es', creator)
    await expect(page.getByText('Primeros Pasos')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('onboarding-next-step')).toContainText('Crea tu primer curso')
  })

  await test.step('curso publicado con una lección (creación rápida + lección sembrada)', async () => {
    await page.goto(`${base}/es/dashboard/admin/courses/new`, { waitUntil: 'domcontentloaded' })
    await fillStable(page.locator('#quick-title'), courseTitle)
    await clickUntil(
      page.getByRole('button', { name: /crear y publicar/i }),
      async () => /\/dashboard\/teacher\/courses\/\d+/.test(page.url()),
      { attempts: 2, settleMs: 30_000 },
    )
    await expect(page).toHaveURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 30_000 })
    courseId = Number(page.url().match(/courses\/(\d+)/)![1])
    const course = await readCourse(admin, courseId)
    expect(course.status).toBe('published')

    // The lesson editor is covered in English above; here the lesson only
    // needs to exist so the public page has a curriculum to show.
    const { error } = await admin.from('lessons').insert({
      course_id: courseId,
      tenant_id: course.tenant_id,
      title: lessonTitle,
      content: `Bienvenido a ${courseTitle}.\n\n<Callout type="info">\nToma apuntes.\n</Callout>`,
      status: 'published',
      sequence: 1,
    })
    expect(error).toBeNull()
  })

  await test.step('5. la página pública y el catálogo en español, de forma anónima', async () => {
    const { context, page: anon, status } = await openAnonymously(
      browser,
      `${base}/es/courses/${courseId}`,
    )
    try {
      expect(status).toBe(200)
      await expect(anon.getByRole('heading', { level: 1, name: courseTitle })).toBeVisible({
        timeout: 20_000,
      })
      await clickUntil(anon.getByRole('button', { name: /todas las lecciones/i }), () =>
        anon.getByText(lessonTitle).isVisible(),
      )
      await expect(anon.getByText(lessonTitle)).toBeVisible()
      await expect(anon.getByText('Gratis', { exact: true }).first()).toBeVisible()
      const cta = anon.getByRole('link', { name: /inscribirse gratis/i })
      await expect(cta).toBeVisible()
      await expect(cta).toHaveAttribute('href', /\/auth\/login\?next=/)

      await anon.goto(`${base}/es/courses`, { waitUntil: 'domcontentloaded' })
      const card = anon.getByRole('link', { name: new RegExp(courseTitle) })
      await expect(card).toBeVisible({ timeout: 20_000 })
      await expect(card).toContainText('Gratis')
      await expect(card).toContainText('1 lecciones')
    } finally {
      await context.close()
    }
  })
})
