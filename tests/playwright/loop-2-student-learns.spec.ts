/**
 * Loop 2 — a student arrives by public link, joins, learns and downloads a
 * verifiable certificate (#671).
 *
 * One fresh student per run, on Code Academy, against a self-contained
 * `[E2E] Loop 2` fixture seeded in `beforeAll` (course, two lessons, one
 * coding exercise, one auto-gradable exam, a $0 product and an active
 * certificate template) and removed in `afterAll`.
 *
 *   1. anonymous /courses/<id> → "Enroll for Free" → login (next kept) →
 *      "Sign up" (next kept) → sign-up → /courses/<id>?enroll=1 auto-enrolls,
 *      joins the school and lands on the course
 *   2. lesson 1 → exercise → lesson 2 → exam → 100% result
 *   3. certificate card → Download PDF is a real PDF → Verify page shows the
 *      student's name to an anonymous visitor
 *   4. log out → Forgot password → request → recovery link →
 *      /auth/update-password → log back in with the new password
 *
 * Steps 1–3 run on desktop and mobile (Pixel 5). Step 4 too — nothing in it
 * is viewport-specific.
 *
 * Why the recovery link is taken from the token, not clicked from the inbox:
 * the emailed link carries a PKCE token that only the requesting browser's
 * verifier cookie can exchange, and the local E2E port is not in
 * `additional_redirect_urls`, so GoTrue rewrites `redirect_to` to `site_url`.
 * `generateLink` yields the plain `token_hash`, and
 * `/auth/confirm?token_hash=…&type=recovery` is the same GoTrue verify path
 * the link performs. When Mailpit is reachable (locally, and in CI — see
 * `.github/workflows/ci.yml`) the spec also asserts the reset email arrived;
 * without a mailer GoTrue rejects the request and the spec records that.
 */
import { test, expect, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { getServiceRoleClient, CODE_ACADEMY_TENANT } from './utils/seed-state'

const BASE = TENANT_BASE
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003' // creator@codeacademy.com
const MAILPIT = process.env.E2E_MAILPIT_URL || 'http://127.0.0.1:54324'
const FIXTURE_PREFIX = '[E2E] Loop 2'

const RUN = Date.now()
const STUDENT = {
  name: 'Loop Two Learner',
  email: `loop2-${RUN}@e2etest.com`,
  password: 'password123',
  newPassword: 'loop2-new-password-456',
}

/* ------------------------------------------------------------------ */
/*  Fixture ids (filled by beforeAll)                                  */
/* ------------------------------------------------------------------ */
let courseId: number
let lessonIds: number[] = []
let exerciseId: number
let examId: number
let productId: number
/** correct answer per question, keyed by question id: 'true'/'false' or an option id */
let correctAnswers: Record<number, string> = {}
let studentId: string | null = null
let verificationCode: string | null = null

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data as NonNullable<T>
}

/* ------------------------------------------------------------------ */
/*  Seed / clean                                                       */
/* ------------------------------------------------------------------ */
async function removeStaleFixtures(admin: SupabaseClient) {
  // A crashed earlier run (or a CI retry in a fresh worker) leaves rows behind
  // under the same prefix. Courses cascade to lessons / exercises / exams /
  // product_courses / entitlements / certificate_templates.
  const { data: courses } = await admin
    .from('courses')
    .select('course_id')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .like('title', `${FIXTURE_PREFIX}%`)
  for (const c of courses ?? []) {
    await admin.from('certificates').delete().eq('course_id', c.course_id)
    await admin.from('courses').delete().eq('course_id', c.course_id)
  }
  await admin.from('products').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('name', `${FIXTURE_PREFIX}%`)

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of users?.users ?? []) {
    if (u.email?.startsWith('loop2-') && u.email.endsWith('@e2etest.com')) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
}

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  await removeStaleFixtures(admin)

  const course = must(
    await admin
      .from('courses')
      .insert({
        title: `${FIXTURE_PREFIX} — Public Link Course ${RUN}`,
        description: 'Seeded by loop-2-student-learns.spec.ts. Safe to delete.',
        status: 'published',
        author_id: CREATOR_ID,
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('course_id')
      .single(),
    'seed course'
  )
  courseId = course.course_id

  const lessons = must(
    await admin
      .from('lessons')
      .insert([
        {
          course_id: courseId,
          title: `${FIXTURE_PREFIX} Lesson 1 — Introduction`,
          description: 'First lesson.',
          content: '# Introduction\n\nWelcome to the Loop 2 course. Read this and mark it complete.',
          sequence: 1,
          status: 'published',
          tenant_id: CODE_ACADEMY_TENANT,
        },
        {
          course_id: courseId,
          title: `${FIXTURE_PREFIX} Lesson 2 — Conclusion`,
          description: 'Second lesson.',
          content: '# Conclusion\n\nYou made it. Mark this complete and take the exam.',
          sequence: 2,
          status: 'published',
          tenant_id: CODE_ACADEMY_TENANT,
        },
      ])
      .select('id, sequence'),
    'seed lessons'
  )
  lessonIds = [...lessons].sort((a, b) => a.sequence - b.sequence).map((l) => l.id)

  const exercise = must(
    await admin
      .from('exercises')
      .insert({
        course_id: courseId,
        lesson_id: lessonIds[0],
        title: `${FIXTURE_PREFIX} Exercise — Hello`,
        description: 'Print hello.',
        instructions: 'Make the editor print "hello" and press Run & Verify.',
        exercise_type: 'coding_challenge',
        difficulty_level: 'easy',
        status: 'published',
        created_by: CREATOR_ID,
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('id')
      .single(),
    'seed exercise'
  )
  exerciseId = exercise.id

  const exam = must(
    await admin
      .from('exams')
      .insert({
        course_id: courseId,
        title: `${FIXTURE_PREFIX} Final Exam`,
        description: 'Two auto-graded questions.',
        exam_date: '2030-12-31T23:59:00Z',
        duration: 30,
        status: 'published',
        sequence: 1,
        created_by: CREATOR_ID,
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('exam_id')
      .single(),
    'seed exam'
  )
  examId = exam.exam_id

  const questions = must(
    await admin
      .from('exam_questions')
      .insert([
        { exam_id: examId, question_text: 'Loop 2 lesson 1 is titled "Introduction".', question_type: 'true_false' },
        { exam_id: examId, question_text: 'How many lessons does this course have?', question_type: 'multiple_choice' },
      ])
      .select('question_id, question_type'),
    'seed exam questions'
  )
  const tf = questions.find((q) => q.question_type === 'true_false')!
  const mc = questions.find((q) => q.question_type === 'multiple_choice')!
  const options = must(
    await admin
      .from('question_options')
      .insert([
        { question_id: tf.question_id, option_text: 'True', is_correct: true },
        { question_id: tf.question_id, option_text: 'False', is_correct: false },
        { question_id: mc.question_id, option_text: 'One', is_correct: false },
        { question_id: mc.question_id, option_text: 'Two', is_correct: true },
        { question_id: mc.question_id, option_text: 'Ten', is_correct: false },
      ])
      .select('option_id, question_id, is_correct'),
    'seed question options'
  )
  correctAnswers = {
    [tf.question_id]: 'true',
    [mc.question_id]: String(options.find((o) => o.question_id === mc.question_id && o.is_correct)!.option_id),
  }

  // A $0 product is what makes the public page say "Enroll for Free" —
  // pickCourseProduct() only treats a course as free when no linked product
  // has a price above zero.
  const product = must(
    await admin
      .from('products')
      .insert({
        name: `${FIXTURE_PREFIX} Free Product ${RUN}`,
        description: 'Free access to the Loop 2 course.',
        price: 0,
        currency: 'usd',
        status: 'active',
        payment_provider: 'manual',
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('product_id')
      .single(),
    'seed product'
  )
  productId = product.product_id
  must(
    await admin
      .from('product_courses')
      .insert({ product_id: productId, course_id: courseId, tenant_id: CODE_ACADEMY_TENANT })
      .select('product_id'),
    'seed product_courses'
  )

  // Certificate issuance is template-gated: no active row, no certificate.
  must(
    await admin
      .from('certificate_templates')
      .insert({
        course_id: courseId,
        tenant_id: CODE_ACADEMY_TENANT,
        template_name: `${FIXTURE_PREFIX} Template`,
        issuer_name: 'Code Academy Pro',
        issuance_criteria: 'Complete every lesson and pass the final exam.',
        is_active: true,
      })
      .select('template_id'),
    'seed certificate template'
  )
})

test.afterAll(async () => {
  const admin = getServiceRoleClient()
  const warn = (what: string) => (res: { error: { message: string } | null }) => {
    if (res.error) console.warn(`loop-2 cleanup: ${what}: ${res.error.message}`)
  }
  // Student-owned rows first: exam_submissions does not cascade from exams,
  // so the course delete below would be refused while a submission exists.
  if (studentId) {
    await admin.from('exam_submissions').delete().eq('student_id', studentId).then(warn('exam_submissions'))
    await admin.from('lesson_completions').delete().eq('user_id', studentId).then(warn('lesson_completions'))
    await admin.from('exercise_completions').delete().eq('user_id', studentId).then(warn('exercise_completions'))
    await admin.from('certificates').delete().eq('user_id', studentId).then(warn('certificates'))
    await admin.from('enrollments').delete().eq('user_id', studentId).then(warn('enrollments'))
    await admin.from('tenant_users').delete().eq('user_id', studentId).then(warn('tenant_users'))
  }
  if (courseId) {
    await admin.from('certificates').delete().eq('course_id', courseId).then(warn('course certificates'))
    await admin.from('courses').delete().eq('course_id', courseId).then(warn('course'))
  }
  if (productId) await admin.from('products').delete().eq('product_id', productId).then(warn('product'))
  if (studentId) {
    const { error } = await admin.auth.admin.deleteUser(studentId)
    if (error) console.warn(`loop-2 cleanup: deleteUser: ${error.message}`)
  }
})

/* ------------------------------------------------------------------ */
/*  Page helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fill a React-controlled input and prove the value survived hydration —
 * the same trick `utils/auth.ts` uses for the login form.
 */
async function fillSettled(page: Page, testId: string, value: string) {
  const field = page.getByTestId(testId)
  await field.waitFor({ state: 'visible', timeout: 30_000 })
  await expect
    .poll(
      async () => {
        await field.fill(value)
        await page.waitForTimeout(500)
        return field.inputValue()
      },
      { timeout: 30_000, intervals: [500, 1000] }
    )
    .toBe(value)
}

/** base-ui buttons intermittently swallow Playwright clicks; click in-page. */
async function domClick(page: Page, testIdOrLocator: string | ReturnType<Page['locator']>) {
  const loc = typeof testIdOrLocator === 'string' ? page.getByTestId(testIdOrLocator) : testIdOrLocator
  await loc.first().waitFor({ state: 'visible', timeout: 30_000 })
  await loc.first().evaluate((el) => (el as HTMLElement).click())
}

async function completeCurrentLesson(page: Page) {
  const toggle = page.getByTestId('lesson-complete-toggle')
  // On the production build the app router briefly keeps the outgoing lesson
  // tree mounted while the next one streams in, so two toggles can exist for
  // a moment. Wait for exactly one — clicking both would complete and then
  // un-complete the lesson.
  await expect(toggle).toHaveCount(1, { timeout: 30_000 })
  await expect(toggle).toBeVisible({ timeout: 30_000 })
  await expect(toggle).toBeEnabled({ timeout: 30_000 })
  await domClick(page, 'lesson-complete-toggle')
}

async function logoutViaMenu(page: Page) {
  await domClick(page, 'user-nav-trigger')
  await domClick(page, 'user-nav-logout')
  await page.waitForURL(/\/auth\/login/, { timeout: 30_000 })
}

async function mailpitReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${MAILPIT}/api/v1/info`)
    return res.ok
  } catch {
    return false
  }
}

/** Newest Mailpit message addressed to `email`, or null. */
async function findMailpitMessage(email: string): Promise<{ ID: string } | null> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  if (!res.ok) return null
  const json = (await res.json()) as { messages?: { ID: string }[] }
  return json.messages?.[0] ?? null
}

/* ================================================================== */
/*  The journey                                                        */
/* ================================================================== */
test.describe.configure({ mode: 'serial' })

test.describe('Loop 2 — public link → join → learn → verifiable certificate', () => {
  test('a new visitor enrols from the public course page, learns, and gets a verifiable certificate', async ({
    page,
    browser,
  }) => {
    // Generous on purpose: locally a dev server cold-compiles each dashboard
    // route on first visit (30–60 s each); CI runs `next start` on a build.
    test.setTimeout(600_000)
    const admin = getServiceRoleClient()

    /* ---- 1. Public link → sign-up with `next` preserved → auto-enroll ---- */
    await test.step('anonymous course page offers free enrollment and keeps the intent into sign-up', async () => {
      await page.goto(`${BASE}/${LOCALE}/courses/${courseId}`, { waitUntil: 'domcontentloaded' })
      const cta = page.getByTestId('course-enroll-cta')
      await expect(cta).toBeVisible({ timeout: 30_000 })
      await expect(cta).toHaveText(/enroll for free/i)

      // A first-time visitor arrived by a shared link and has no account, so
      // the CTA goes straight to sign-up (#685); returning students take the
      // secondary link, which carries the same intent.
      const loginLink = page.getByTestId('course-enroll-login')
      await expect(loginLink).toBeVisible({ timeout: 30_000 })
      expect(await loginLink.getAttribute('href')).toContain(
        encodeURIComponent(`/courses/${courseId}?enroll=1`),
      )

      await domClick(page, 'course-enroll-cta')
      await page.waitForURL(/\/auth\/sign-up\?/, { timeout: 30_000 })
      expect(new URL(page.url()).searchParams.get('next')).toBe(`/courses/${courseId}?enroll=1`)
    })

    await test.step('sign-up lands on the course as an enrolled member of the school', async () => {
      await fillSettled(page, 'signup-name', STUDENT.name)
      await fillSettled(page, 'signup-email', STUDENT.email)
      await fillSettled(page, 'signup-password', STUDENT.password)
      await domClick(page, 'signup-submit')

      // /courses/<id>?enroll=1 mounts AutoFreeEnrollButton, which joins the
      // school and grants the free entitlement before pushing to the course.
      await page.waitForURL(new RegExp(`/dashboard/student/courses/${courseId}(?:[/?#]|$)`), {
        timeout: 90_000,
      })

      const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
      studentId = users?.users.find((u) => u.email === STUDENT.email)?.id ?? null
      expect(studentId, 'sign-up created an auth user').toBeTruthy()

      const membership = must(
        await admin
          .from('tenant_users')
          .select('role, status')
          .eq('tenant_id', CODE_ACADEMY_TENANT)
          .eq('user_id', studentId!)
          .single(),
        'tenant_users row after free enrollment'
      )
      expect(membership).toMatchObject({ role: 'student', status: 'active' })

      const entitlement = must(
        await admin
          .from('entitlements')
          .select('source_type, status')
          .eq('tenant_id', CODE_ACADEMY_TENANT)
          .eq('user_id', studentId!)
          .eq('course_id', courseId)
          .single(),
        'entitlement after free enrollment'
      )
      expect(entitlement).toMatchObject({ source_type: 'free', status: 'active' })
    })

    /* ---- 2. Learn: lesson → exercise → lesson → exam ---- */
    await test.step('lesson 1 completes and advances to lesson 2', async () => {
      await page.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${courseId}/lessons/${lessonIds[0]}`, {
        waitUntil: 'domcontentloaded',
      })
      await expect(page.locator('body')).toContainText('Introduction', { timeout: 30_000 })
      await completeCurrentLesson(page)
      // Completing a lesson with a successor auto-navigates to it.
      await page.waitForURL(new RegExp(`/lessons/${lessonIds[1]}(?:[/?#]|$)`), { timeout: 30_000 })
      await expect
        .poll(async () => {
          const { count } = await admin
            .from('lesson_completions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', studentId!)
            .eq('lesson_id', lessonIds[0])
          return count ?? 0
        }, { timeout: 30_000 })
        .toBe(1)
    })

    await test.step('exercise submits and records a completion', async () => {
      await page.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${courseId}/exercises/${exerciseId}`, {
        waitUntil: 'domcontentloaded',
      })
      const run = page.getByRole('button', { name: /run & verify/i })
      await expect(run).toBeVisible({ timeout: 60_000 })
      await domClick(page, run)
      await expect
        .poll(
          async () => {
            const { count } = await admin
              .from('exercise_completions')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', studentId!)
              .eq('exercise_id', exerciseId)
            return count ?? 0
          },
          { timeout: 30_000 }
        )
        .toBe(1)
    })

    await test.step('lesson 2 completes (no certificate yet — the exam is still open)', async () => {
      await page.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${courseId}/lessons/${lessonIds[1]}`, {
        waitUntil: 'domcontentloaded',
      })
      await expect(page.locator('body')).toContainText('Conclusion', { timeout: 30_000 })
      await completeCurrentLesson(page)
      await expect
        .poll(async () => {
          const { count } = await admin
            .from('lesson_completions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', studentId!)
            .in('lesson_id', lessonIds)
          return count ?? 0
        }, { timeout: 30_000 })
        .toBe(2)
      const { count: certs } = await admin
        .from('certificates')
        .select('certificate_id', { count: 'exact', head: true })
        .eq('user_id', studentId!)
        .eq('course_id', courseId)
      expect(certs ?? 0).toBe(0)
    })

    await test.step('exam is answered correctly and graded 100% without AI', async () => {
      await page.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${courseId}/exams/${examId}`, {
        waitUntil: 'domcontentloaded',
      })
      const submit = page.getByTestId('exam-finish-submit')
      const next = page.getByRole('button', { name: /next question/i })

      for (let i = 0; i < Object.keys(correctAnswers).length; i++) {
        await expect(page.locator('[role="radiogroup"]').first()).toBeVisible({ timeout: 30_000 })
        // true/false renders labels `for="true"|"false"`; multiple choice `for="option-<id>"`.
        const tfLabel = page.locator('label[for="true"]')
        if (await tfLabel.count()) {
          const tfQuestionId = Number(Object.keys(correctAnswers).find((id) => /^(true|false)$/.test(correctAnswers[Number(id)])))
          await domClick(page, page.locator(`label[for="${correctAnswers[tfQuestionId]}"]`))
        } else {
          const mcQuestionId = Number(Object.keys(correctAnswers).find((id) => !/^(true|false)$/.test(correctAnswers[Number(id)])))
          await domClick(page, page.locator(`label[for="option-${correctAnswers[mcQuestionId]}"]`))
        }
        if (await submit.count()) break
        await domClick(page, next)
      }

      await expect(submit).toBeVisible({ timeout: 30_000 })
      await domClick(page, 'exam-finish-submit')
      await page.waitForURL(/\/exams\/\d+\/result/, { timeout: 180_000 })
      await expect(page.locator('body')).toContainText('100%', { timeout: 60_000 })
    })

    /* ---- 3. Certificate: card → PDF → anonymous verification ---- */
    await test.step('certificate is issued and listed with Download PDF and Verify', async () => {
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from('certificates')
              .select('verification_code')
              .eq('user_id', studentId!)
              .eq('course_id', courseId)
              .is('revoked_at', null)
              .limit(1)
            return data?.[0]?.verification_code ?? null
          },
          { timeout: 30_000 }
        )
        .not.toBeNull()

      await page.goto(`${BASE}/${LOCALE}/dashboard/student/certificates`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('certificates-page')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('certificate-download-pdf').first()).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('certificate-verify-link').first()).toBeVisible()

      const verifyHref = await page.getByTestId('certificate-verify-link').first().getAttribute('href')
      expect(verifyHref).toMatch(/\/verify\/[^/]+$/)
      verificationCode = verifyHref!.split('/verify/')[1]
    })

    await test.step('Download PDF returns a real PDF', async () => {
      const href = await page.getByTestId('certificate-download-pdf').first().getAttribute('href')
      expect(href).toMatch(/^\/api\/certificates\/[^/]+\?format=pdf$/)
      // Same cookie jar as the page — this is exactly what the browser sends.
      const res = await page.request.get(`${BASE}${href}`)
      expect(res.status(), await res.text().catch(() => '')).toBe(200)
      expect(res.headers()['content-type']).toContain('application/pdf')
      const body = await res.body()
      expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
      expect(body.length).toBeGreaterThan(1_000)
    })

    await test.step('Verify page shows the student to an anonymous visitor', async () => {
      const anon = await browser.newContext()
      try {
        const anonPage = await anon.newPage()
        await anonPage.goto(`${BASE}/${LOCALE}/verify/${verificationCode}`, { waitUntil: 'domcontentloaded' })
        await expect(anonPage.getByText(/verified credential/i).first()).toBeVisible({ timeout: 30_000 })
        await expect(anonPage.locator('h1').first()).toContainText(STUDENT.name)
        await expect(anonPage.locator('body')).toContainText(verificationCode!)
        await expect(anonPage.getByText(/not found/i)).toHaveCount(0)
      } finally {
        await anon.close()
      }
    })

    await test.step('student logs out', async () => {
      await page.goto(`${BASE}/${LOCALE}/dashboard/student`, { waitUntil: 'domcontentloaded' })
      await logoutViaMenu(page)
    })
  })

  /* ---- 4. Password reset ---- */
  test('the student resets a forgotten password and logs back in', async ({ page }) => {
    test.setTimeout(300_000)
    expect(studentId, 'previous test created the student').toBeTruthy()
    const admin = getServiceRoleClient()
    const hasInbox = await mailpitReachable()

    await test.step('"Forgot your password?" sends a reset request', async () => {
      await page.goto(`${BASE}/${LOCALE}/auth/login`, { waitUntil: 'domcontentloaded' })
      await domClick(page, 'login-forgot-password-link')
      await page.waitForURL(/\/auth\/forgot-password/, { timeout: 30_000 })
      await fillSettled(page, 'forgot-password-email', STUDENT.email)
      await domClick(page, 'forgot-password-submit')
      const success = page.getByText(/check your email/i)
      if (hasInbox) {
        await expect(success).toBeVisible({ timeout: 30_000 })
        return
      }
      // No mailer behind GoTrue (Supabase started with `-x mailpit`): the
      // request itself is rejected with "Error sending recovery email" and
      // the form shows it. The form round-trip is still exercised; the
      // recovery token comes from generateLink below.
      const outcome = success.or(page.locator('form p.text-red-500'))
      await expect(outcome.first()).toBeVisible({ timeout: 30_000 })
      test.info().annotations.push({
        type: 'note',
        description: `no inbox — forgot-password form showed: ${(await outcome.first().textContent())?.trim()}`,
      })
    })

    let tokenHash: string | null = null

    await test.step('the reset email reaches the local inbox (when one is running)', async () => {
      if (!hasInbox) return
      const message = await expect
        .poll(() => findMailpitMessage(STUDENT.email), { timeout: 30_000 })
        .not.toBeNull()
        .then(() => findMailpitMessage(STUDENT.email))
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${message!.ID}`)).json()) as {
        Text?: string
        HTML?: string
      }
      const link = `${full.HTML ?? ''}\n${full.Text ?? ''}`.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0]
      expect(link, 'reset email carries a GoTrue verify link').toBeTruthy()
      const token = new URL(link!.replace(/&amp;/g, '&')).searchParams.get('token')
      // A PKCE token needs the browser's verifier cookie; the plain token hash
      // is usable through /auth/confirm. Otherwise fall through to generateLink.
      if (token && !token.startsWith('pkce_')) tokenHash = token
    })

    await test.step('the recovery link opens the update-password page', async () => {
      if (!tokenHash) {
        const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: STUDENT.email })
        if (error) throw new Error(`generateLink: ${error.message}`)
        tokenHash = data.properties.hashed_token
      }
      const next = `/${LOCALE}/auth/update-password`
      await page.goto(
        `${BASE}/${LOCALE}/auth/confirm?token_hash=${encodeURIComponent(tokenHash!)}&type=recovery&next=${encodeURIComponent(next)}`,
        { waitUntil: 'domcontentloaded' }
      )
      await page.waitForURL(/\/auth\/update-password/, { timeout: 30_000 })
    })

    await test.step('a new password is saved and works at the login form', async () => {
      await fillSettled(page, 'update-password-password', STUDENT.newPassword)
      await domClick(page, 'update-password-submit')
      await page.waitForURL(/\/dashboard\//, { timeout: 60_000 })

      await logoutViaMenu(page)

      await fillSettled(page, 'login-email', STUDENT.email)
      await fillSettled(page, 'login-password', STUDENT.newPassword)
      await domClick(page, 'login-submit')
      await page.waitForURL(/\/dashboard\/student/, { timeout: 60_000 })
    })
  })
})
