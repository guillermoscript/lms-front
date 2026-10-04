/**
 * Screenshot matrix for issue #764 surface 3 — the AUTHENTICATED staff surface.
 *
 * Sibling of scripts/qa-public-theme-matrix.ts (surface 2). The differences that
 * shape this script:
 *
 *  - every screen needs a session, so it logs in once and replays the storage
 *    state into each theme/mode context instead of logging in ten times;
 *  - the richest staff data lives on the `default` tenant (transactions,
 *    payment requests, subscriptions, an exam submission), so this matrix flips
 *    that tenant's theme row, not code-academy's;
 *  - the biggest files in the surface are behind a click (the block editor's
 *    add-block menu, the landing-page template picker, the version history
 *    sheet), so a screen may carry a `prepare` step;
 *  - 30 screens x 10 combinations is more than the review needs, so screens are
 *    tiered: tier A runs every theme x mode, tier B runs two combinations that
 *    between them cover a light kit and the dark-by-default kit.
 *
 * Usage: npx tsx scripts/qa-staff-theme-matrix.ts <baseUrl> <outDir>
 *   e.g. npx tsx scripts/qa-staff-theme-matrix.ts http://default.lvh.me:3005 /tmp/764c-before
 *
 * Env:
 *   MATRIX_THEMES=estructura,platform   limit the theme passes
 *   MATRIX_SCREENS=admin-home,…         limit the screens (ignores tiers)
 *   MATRIX_TIER=A                       run tier A only
 *   MATRIX_PLATFORM_BASE=http://lvh.me:3005   where the tenant-less screens live
 */

import { chromium, type Browser, type Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const TENANT_ID = process.env.MATRIX_TENANT ?? '00000000-0000-0000-0000-000000000001' // default school
const DB_CONTAINER = 'supabase_db_lms-front'
const EMAIL = process.env.MATRIX_EMAIL ?? 'owner@e2etest.com'
const PASSWORD = process.env.MATRIX_PASSWORD ?? 'password123'

const THEMES: { id: string; hex: string | null }[] = [
  { id: 'estructura', hex: '#3A50B8' },
  { id: 'andina', hex: '#2F6B4F' },
  { id: 'kodigo', hex: '#F2B705' },
  { id: 'luz', hex: '#C2185B' },
  { id: 'platform', hex: null },
]
const KIT_HEXES = new Set(THEMES.filter((t) => t.hex).map((t) => t.hex!.toUpperCase()))
const MODES = ['light', 'dark'] as const

/** Tier B runs only here: one light kit and the dark-by-default kit. */
const TIER_B_COMBOS = new Set(['estructura|light', 'kodigo|dark'])

function log(msg: string) {
  console.log(`[staff-matrix] ${msg}`)
}

// ---------------------------------------------------------------------------
// DB helpers — docker exec psql, no host psql available locally.
// ---------------------------------------------------------------------------

function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-F', '|', '-c', sql],
    { encoding: 'utf8' }
  )
}

function scalar(sql: string): string | null {
  const out = psql(sql).trim()
  return out.length ? out.split('\n')[0] : null
}

function setThemeRow(themeId: string, hex: string) {
  const value = JSON.stringify({ type: 'kit', theme: themeId, brand: hex }).replace(/'/g, "''")
  psql(
    `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value) VALUES ('${TENANT_ID}','theme_preset','${value}'::jsonb) ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`
  )
}

function clearThemeRow() {
  psql(`DELETE FROM tenant_settings WHERE tenant_id='${TENANT_ID}' AND setting_key='theme_preset'`)
}

function restoreThemeRow(original: string | null) {
  if (original === null) {
    clearThemeRow()
    return
  }
  const escaped = original.replace(/'/g, "''")
  psql(
    `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value) VALUES ('${TENANT_ID}','theme_preset','${escaped}'::jsonb) ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`
  )
}

// ---------------------------------------------------------------------------
// Fixtures
//
// The seed gives the default tenant courses, lessons, an exam with one
// submission, products, subscriptions and completed payment requests, but no
// payout, no invoice, no certificate and nothing still pending — and an empty
// table is exactly the state that renders none of the status colours this sweep
// is about. These rows are created once, under fixed ids, and left in place so
// a "before" run on master and an "after" run on the branch see the same data.
// ---------------------------------------------------------------------------

const QA_PREFIX = 'QA764C'

function ensureFixtures() {
  const studentId = scalar(
    `SELECT tu.user_id::text FROM tenant_users tu WHERE tu.tenant_id='${TENANT_ID}' AND tu.role='student' LIMIT 1`
  )
  const productId = scalar(`SELECT p.product_id::text FROM products p WHERE p.tenant_id='${TENANT_ID}' ORDER BY p.product_id LIMIT 1`)

  // A payment request still waiting on an admin — the pending badge, the
  // confirm/reject actions and the detail page all only exist in this state.
  if (studentId && productId) {
    const pending = scalar(
      `SELECT request_id::text FROM payment_requests WHERE tenant_id='${TENANT_ID}' AND status='pending' LIMIT 1`
    )
    if (!pending) {
      psql(`INSERT INTO payment_requests (tenant_id, user_id, product_id, contact_name, contact_email, contact_phone, message, status, payment_method, payment_amount, payment_currency)
            VALUES ('${TENANT_ID}','${studentId}',${productId},'${QA_PREFIX} Marta Ruiz','marta@example.com','+58 412 555 0134','Transferencia hecha esta mañana, adjunto comprobante.','pending','manual',49.00,'usd')`)
      log('created a pending payment_requests fixture')
    }
  }

  // A payout in each of the two states the table colours differently.
  const payout = scalar(`SELECT payout_id::text FROM payouts WHERE tenant_id='${TENANT_ID}' LIMIT 1`)
  if (!payout) {
    psql(`INSERT INTO payouts (tenant_id, amount, currency, status, payout_method, period_start, period_end, paid_at, note)
          VALUES ('${TENANT_ID}', 420.00, 'usd', 'paid', 'manual', now() - interval '60 days', now() - interval '30 days', now() - interval '29 days', '${QA_PREFIX} settled'),
                 ('${TENANT_ID}', 180.50, 'usd', 'pending', 'stripe_connect', now() - interval '30 days', now(), NULL, '${QA_PREFIX} in flight')`)
    log('created payouts fixtures')
  }

  // One paid and one overdue invoice.
  const invoice = scalar(`SELECT invoice_id::text FROM invoices WHERE tenant_id='${TENANT_ID}' LIMIT 1`)
  if (!invoice && studentId) {
    psql(`INSERT INTO invoices (tenant_id, user_id, invoice_number, amount, tax_amount, total_amount, currency, status, due_date, paid_at)
          VALUES ('${TENANT_ID}','${studentId}','${QA_PREFIX}-0001', 49.00, 0, 49.00, 'usd', 'paid', now() - interval '10 days', now() - interval '9 days'),
                 ('${TENANT_ID}','${studentId}','${QA_PREFIX}-0002', 99.00, 0, 99.00, 'usd', 'sent', now() - interval '2 days', NULL)`)
    log('created invoices fixtures')
  }

  // Two saved versions of the richest lesson: without them the history sheet
  // renders its empty state and version-preview.tsx / version-diff-panel.tsx —
  // 60 palette classes between them — never mount at all.
  const lessonId = scalar(
    `SELECT l.id::text FROM lessons l JOIN courses c ON c.course_id=l.course_id WHERE c.tenant_id='${TENANT_ID}' ORDER BY length(l.content) DESC NULLS LAST, l.id DESC LIMIT 1`
  )
  if (lessonId) {
    const have = scalar(`SELECT count(*)::text FROM content_versions WHERE content_type='lesson' AND content_id=${lessonId}`)
    if (have === '0') {
      const v1 = JSON.stringify({
        title: 'Interactive Blocks Preview',
        description: 'A tour of every block type.',
        status: 'draft',
        video_url: '',
        content: '# Interactive Blocks Preview\n\nWelcome! This lesson previews the callout block.\n\nA first draft of the introduction.',
        ai_task_description: 'Summarise the lesson.',
      }).replace(/'/g, "''")
      const v2 = JSON.stringify({
        title: 'Interactive Blocks Preview',
        description: 'A tour of every interactive block available on the platform.',
        status: 'published',
        video_url: '',
        content: '# Interactive Blocks Preview\n\nWelcome! This lesson previews every interactive block available on the platform.\n\nQuizzes, flashcards and checkpoints all appear below.',
        ai_task_description: 'Summarise the lesson and name three blocks.',
      }).replace(/'/g, "''")
      psql(`INSERT INTO content_versions (content_type, content_id, version_number, snapshot, created_at)
            VALUES ('lesson', ${lessonId}, 1, '${v1}'::jsonb, now() - interval '3 days'),
                   ('lesson', ${lessonId}, 2, '${v2}'::jsonb, now() - interval '1 day')`)
      log('created content_versions fixtures')
    }
  }

  // A certificate template makes the teacher certificates page render its
  // designed preview; its design_settings are content colours the sweep must
  // not touch.
  let templateId = scalar(`SELECT template_id::text FROM certificate_templates WHERE tenant_id='${TENANT_ID}' LIMIT 1`)
  if (!templateId) {
    const courseId = scalar(`SELECT c.course_id::text FROM courses c WHERE c.tenant_id='${TENANT_ID}' ORDER BY c.course_id LIMIT 1`)
    templateId = scalar(`
      INSERT INTO certificate_templates (tenant_id, course_id, template_name, issuer_name, signature_name, signature_title, design_settings)
      VALUES ('${TENANT_ID}', ${courseId}, '${QA_PREFIX} Template', 'Default School', 'Ada Lovelace', 'Director of Studies',
              '{"primary_color":"#1a5632","secondary_color":"#0f2b1a"}'::jsonb)
      RETURNING template_id::text`)
    log('created a certificate_templates fixture')
  }
}

interface Fixtures {
  courseId: string
  lessonId: string | null
  examId: string | null
  submissionId: string | null
  productId: string | null
  paymentRequestId: string | null
  memberId: string | null
}

function discoverFixtures(): Fixtures {
  ensureFixtures()
  const courseId = scalar(
    `SELECT c.course_id::text FROM courses c WHERE c.tenant_id='${TENANT_ID}' AND EXISTS (SELECT 1 FROM lessons l WHERE l.course_id=c.course_id) ORDER BY c.course_id LIMIT 1`
  )
  if (!courseId) throw new Error(`no course with lessons on tenant ${TENANT_ID}`)
  return {
    courseId,
    // The richest lesson, so the block editor has something to render.
    lessonId: scalar(
      `SELECT l.id::text FROM lessons l WHERE l.course_id=${courseId} ORDER BY length(l.content) DESC NULLS LAST, l.id DESC LIMIT 1`
    ),
    examId: scalar(`SELECT e.exam_id::text FROM exams e WHERE e.tenant_id='${TENANT_ID}' ORDER BY e.exam_id LIMIT 1`),
    submissionId: scalar(
      `SELECT s.submission_id::text FROM exam_submissions s JOIN exams e ON e.exam_id=s.exam_id WHERE e.tenant_id='${TENANT_ID}' ORDER BY s.submission_id LIMIT 1`
    ),
    productId: scalar(`SELECT p.product_id::text FROM products p WHERE p.tenant_id='${TENANT_ID}' ORDER BY p.product_id LIMIT 1`),
    paymentRequestId: scalar(
      `SELECT r.request_id::text FROM payment_requests r WHERE r.tenant_id='${TENANT_ID}' AND r.status='pending' ORDER BY r.request_id DESC LIMIT 1`
    ),
    memberId: scalar(`SELECT tu.user_id::text FROM tenant_users tu WHERE tu.tenant_id='${TENANT_ID}' AND tu.role='student' LIMIT 1`),
  }
}

// ---------------------------------------------------------------------------
// Login — ported from tests/playwright/utils/auth.ts, which knows the two
// traps: a value typed before React hydrates the input never reaches component
// state, and a Playwright click on a base-ui Button intermittently lands
// without firing the handler.
// ---------------------------------------------------------------------------

async function poll<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs: number, everyMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await fn().catch(() => null as unknown as T)
    if (value !== null && ok(value)) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, everyMs))
  }
}

async function login(page: Page, baseUrl: string) {
  await page.goto(`${baseUrl}/en/auth/login`, { waitUntil: 'domcontentloaded' })
  const email = page.getByTestId('login-email')
  await email.waitFor({ state: 'visible', timeout: 60_000 })

  // React stamps `__reactProps$…` on a node once it has hydrated it.
  await poll(
    () => email.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))),
    (v) => v === true,
    60_000,
    500,
    'the login form to hydrate'
  )

  await poll(
    async () => {
      await email.fill(EMAIL)
      await page.getByTestId('login-password').fill(PASSWORD)
      await page.waitForTimeout(750)
      return email.inputValue()
    },
    (v) => v === EMAIL,
    45_000,
    500,
    'the credentials to survive a client render'
  )

  const button = page.getByTestId('login-submit')
  for (let attempt = 0; attempt < 4 && !page.url().includes('/dashboard/'); attempt++) {
    await button.click().catch(() => undefined)
    await page.waitForURL('**/dashboard/**', { timeout: 25_000, waitUntil: 'commit' }).catch(() => undefined)
  }
  if (!page.url().includes('/dashboard/')) throw new Error(`login never reached the dashboard (at ${page.url()})`)
  await page.evaluate(() => localStorage.setItem('tours-disabled', 'true'))
}

// ---------------------------------------------------------------------------
// Theme convergence
// ---------------------------------------------------------------------------

function brandMatches(value: string, expectedHex: string | null): boolean {
  const v = value.trim().toUpperCase()
  if (expectedHex) return v === expectedHex.toUpperCase()
  return !KIT_HEXES.has(v)
}

async function pollThemeApplied(page: Page, pollUrl: string, expectedHex: string | null, mode: string) {
  const deadline = Date.now() + 120_000
  for (;;) {
    await page.goto(pollUrl, { waitUntil: 'domcontentloaded' })
    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()
    )
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    if (brandMatches(brand, expectedHex) && isDark === (mode === 'dark')) return
    if (Date.now() > deadline) {
      throw new Error(
        `theme never converged (want brand=${expectedHex ?? 'platform-default'} mode=${mode}; saw brand=${brand} dark=${isDark})`
      )
    }
    // The dashboard layout caches tenant_settings for 60s (unstable_cache).
    await page.waitForTimeout(4000)
  }
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

interface Screen {
  name: string
  path: string | null
  tier: 'A' | 'B'
  platform?: boolean
  skipReason?: string
  prepare?: (page: Page) => Promise<void>
}

/** base-ui buttons swallow a plain Playwright click often enough to matter. */
async function hardClick(page: Page, selector: string, timeout = 10_000): Promise<boolean> {
  const el = page.locator(selector).first()
  try {
    await el.waitFor({ state: 'visible', timeout })
  } catch {
    return false
  }
  await el.click({ timeout: 5000 }).catch(() => undefined)
  await page.waitForTimeout(600)
  const opened = await page.evaluate(
    () => !!document.querySelector('[role="dialog"],[role="menu"],[data-state="open"]')
  )
  if (opened) return true
  await el.evaluate((node) => (node as HTMLElement).click()).catch(() => undefined)
  await page.waitForTimeout(600)
  return true
}

function buildScreens(f: Fixtures): Screen[] {
  const course = `/en/dashboard/teacher/courses/${f.courseId}`
  return [
    // ---- teacher ----
    { name: 'teacher-home', path: '/en/dashboard/teacher', tier: 'A' },
    { name: 'teacher-courses', path: '/en/dashboard/teacher/courses', tier: 'B' },
    { name: 'teacher-course', path: course, tier: 'A' },
    { name: 'teacher-exercises', path: `${course}/exercises`, tier: 'B' },
    { name: 'teacher-certificates', path: `${course}/certificates`, tier: 'B' },
    { name: 'teacher-revenue', path: '/en/dashboard/teacher/revenue', tier: 'A' },
    { name: 'teacher-preview', path: `${course}/preview`, tier: 'B' },
    f.examId
      ? { name: 'teacher-exam-submissions', path: `${course}/exams/${f.examId}/submissions`, tier: 'A' }
      : { name: 'teacher-exam-submissions', path: null, tier: 'A', skipReason: 'no exam on this tenant' },
    f.examId && f.submissionId
      ? { name: 'teacher-submission-review', path: `${course}/exams/${f.examId}/submissions/${f.submissionId}`, tier: 'A' }
      : { name: 'teacher-submission-review', path: null, tier: 'A', skipReason: 'no exam submission on this tenant' },
    f.lessonId
      ? {
          name: 'teacher-lesson-editor',
          path: `${course}/lessons/${f.lessonId}`,
          tier: 'A',
        }
      : { name: 'teacher-lesson-editor', path: null, tier: 'A', skipReason: 'no lesson on this course' },
    f.lessonId
      ? {
          name: 'teacher-add-block-menu',
          path: `${course}/lessons/${f.lessonId}`,
          tier: 'A',
          // add-block-menu.tsx is the single biggest file in this surface and it
          // only exists once the menu is open.
          prepare: async (page) => {
            await page.waitForTimeout(1500)
            // The editor opens on its Details step; the block editor is the
            // Content step, and the palette is one more click inside it.
            await hardClick(page, 'button:has-text("Content")', 6000)
            await page.waitForTimeout(1600)
            const opened =
              (await hardClick(page, '[aria-label="Add block"]', 5000)) ||
              (await hardClick(page, 'button:has-text("Add block")', 4000)) ||
              (await hardClick(page, 'button:has-text("Añadir bloque")', 3000))
            if (!opened) throw new Error('add-block trigger not found')
            await page.waitForTimeout(900)
          },
        }
      : { name: 'teacher-add-block-menu', path: null, tier: 'A', skipReason: 'no lesson on this course' },
    f.lessonId
      ? {
          name: 'teacher-version-history',
          path: `${course}/lessons/${f.lessonId}`,
          tier: 'B',
          prepare: async (page) => {
            await page.waitForTimeout(1500)
            const opened =
              (await hardClick(page, 'button:has-text("History")', 5000)) ||
              (await hardClick(page, 'button:has-text("Historial")', 3000))
            if (!opened) throw new Error('version history trigger not found')
            await page.waitForTimeout(1600)
            // Land on the diff: version-diff-panel.tsx is the colour-dense half.
            await hardClick(page, 'button:has-text("Compare")', 4000)
            await page.waitForTimeout(900)
          },
        }
      : { name: 'teacher-version-history', path: null, tier: 'B', skipReason: 'no lesson on this course' },

    // ---- admin ----
    { name: 'admin-home', path: '/en/dashboard/admin', tier: 'A' },
    { name: 'admin-monetization', path: '/en/dashboard/admin/monetization', tier: 'A' },
    { name: 'admin-transactions', path: '/en/dashboard/admin/transactions', tier: 'A' },
    { name: 'admin-products', path: '/en/dashboard/admin/products', tier: 'A' },
    { name: 'admin-subscriptions', path: '/en/dashboard/admin/subscriptions', tier: 'A' },
    { name: 'admin-payment-requests', path: '/en/dashboard/admin/payment-requests', tier: 'A' },
    f.paymentRequestId
      ? { name: 'admin-payment-request', path: `/en/dashboard/admin/payment-requests/${f.paymentRequestId}`, tier: 'B' }
      : { name: 'admin-payment-request', path: null, tier: 'B', skipReason: 'no pending payment request' },
    { name: 'admin-users', path: '/en/dashboard/admin/users', tier: 'A' },
    { name: 'admin-enrollments', path: '/en/dashboard/admin/enrollments', tier: 'B' },
    { name: 'admin-payouts', path: '/en/dashboard/admin/payouts', tier: 'B' },
    { name: 'admin-revenue', path: '/en/dashboard/admin/revenue', tier: 'B' },
    { name: 'admin-invoices', path: '/en/dashboard/admin/invoices', tier: 'B' },
    { name: 'admin-plans', path: '/en/dashboard/admin/plans', tier: 'B' },
    { name: 'admin-courses', path: '/en/dashboard/admin/courses', tier: 'B' },
    { name: 'admin-notifications', path: '/en/dashboard/admin/notifications', tier: 'B' },
    { name: 'admin-billing', path: '/en/dashboard/admin/billing', tier: 'B' },
    { name: 'admin-landing-page', path: '/en/dashboard/admin/landing-page', tier: 'A' },
    {
      name: 'admin-template-picker',
      path: '/en/dashboard/admin/landing-page',
      tier: 'A',
      prepare: async (page) => {
        await page.waitForTimeout(1200)
        const opened =
          (await hardClick(page, 'button:has-text("Get Started")', 5000)) ||
          (await hardClick(page, 'button:has-text("New Page")', 4000)) ||
          (await hardClick(page, 'button:has-text("Comenzar")', 3000))
        if (!opened) throw new Error('template picker trigger not found')
        await page.waitForTimeout(900)
      },
    },
    {
      name: 'admin-template-grid',
      path: '/en/dashboard/admin/landing-page',
      tier: 'B',
      prepare: async (page) => {
        await page.waitForTimeout(1200)
        const opened =
          (await hardClick(page, 'button:has-text("Get Started")', 5000)) ||
          (await hardClick(page, 'button:has-text("New Page")', 4000))
        if (!opened) throw new Error('template picker trigger not found')
        await page.waitForTimeout(700)
        // Step two of the same dialog is the template grid.
        await hardClick(page, 'button:has-text("Next")', 4000)
        await page.waitForTimeout(900)
      },
    },

    // ---- onboarding ----
    { name: 'onboarding-wizard', path: '/en/onboarding', tier: 'A' },
    {
      name: 'onboarding-step2',
      path: '/en/onboarding',
      tier: 'B',
      prepare: async (page) => {
        await page.waitForTimeout(1200)
        await hardClick(page, 'button:has-text("Next")', 4000)
        await page.waitForTimeout(900)
      },
    },
    // The platform root has no tenant, so this screen never follows a school
    // theme — it is captured twice, for light and dark, as a regression check.
    { name: 'create-school', path: '/en/create-school', tier: 'B', platform: true },
  ]
}

// ---------------------------------------------------------------------------
// Screenshotting
// ---------------------------------------------------------------------------

const AXE_PATH = path.resolve('node_modules/axe-core/axe.min.js')

async function contrastViolations(page: Page): Promise<{ count: number; samples: string[] }> {
  await page.addScriptTag({ path: AXE_PATH })
  return page.evaluate(async () => {
    const w = window as unknown as {
      axe: {
        run: (
          ctx: unknown,
          opts: unknown
        ) => Promise<{ violations: { nodes: { target: string[]; failureSummary?: string }[] }[] }>
      }
    }
    const res = await w.axe.run(document, { runOnly: ['color-contrast'] })
    const nodes = res.violations.flatMap((v) => v.nodes)
    return {
      count: nodes.length,
      samples: nodes
        .slice(0, 6)
        .map((n) => `${n.target.join(' ')} — ${(n.failureSummary ?? '').split('\n').slice(-1)[0]}`),
    }
  })
}

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

async function shoot(page: Page, url: string, outPath: string, screen: Screen, axeResults: Record<string, unknown>) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  if (screen.prepare) {
    try {
      await screen.prepare(page)
    } catch (err) {
      log(`PREPARE FAILED for ${screen.name}: ${err}`)
      axeResults[`${path.basename(outPath, '.png')}__prepare`] = { error: String(err) }
    }
  }
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal').forEach((el) => el.remove())
    document.querySelectorAll('[data-sonner-toaster]').forEach((el) => el.remove())
  })
  // A screen whose content is a dialog is captured at viewport size: fullPage
  // on an open dialog photographs the scrolled page behind it.
  const hasOverlay = await page.evaluate(() => !!document.querySelector('[role="dialog"],[role="menu"]'))
  await page.screenshot({ path: outPath, fullPage: !hasOverlay })
  log(`wrote ${path.basename(outPath)}`)
  try {
    axeResults[path.basename(outPath, '.png')] = await withDeadline(contrastViolations(page), 25_000)
  } catch (err) {
    axeResults[path.basename(outPath, '.png')] = { error: String(err) }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [, , baseUrl, outDir] = process.argv
  if (!baseUrl || !outDir) {
    console.error('Usage: npx tsx scripts/qa-staff-theme-matrix.ts <baseUrl> <outDir>')
    process.exit(1)
  }
  const platformBase = process.env.MATRIX_PLATFORM_BASE ?? baseUrl.replace(/\/\/[^.]+\./, '//')
  mkdirSync(outDir, { recursive: true })

  const startedAt = Date.now()
  const fixtures = discoverFixtures()
  log(`fixtures: ${JSON.stringify(fixtures)}`)

  const screens = buildScreens(fixtures)
  for (const s of screens) if (s.skipReason) log(`SKIP ${s.name}: ${s.skipReason}`)
  const onlyScreens = process.env.MATRIX_SCREENS?.split(',').map((s) => s.trim())
  const onlyTier = process.env.MATRIX_TIER

  const originalRow = scalar(
    `SELECT setting_value::text FROM tenant_settings WHERE tenant_id='${TENANT_ID}' AND setting_key='theme_preset'`
  )
  log(`original theme_preset row: ${originalRow === null ? '(none)' : originalRow}`)

  const axeResults: Record<string, unknown> = {}
  let pngCount = 0
  let browser: Browser | null = null
  try {
    browser = await chromium.launch()

    // One login, replayed into every combination.
    const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const authPage = await authContext.newPage()
    await login(authPage, baseUrl)
    const storageState = await authContext.storageState()
    await authContext.close()
    log(`signed in as ${EMAIL}`)

    const only = process.env.MATRIX_THEMES?.split(',').map((t) => t.trim())
    for (const theme of THEMES.filter((t) => !only || only.includes(t.id))) {
      if (theme.hex) {
        setThemeRow(theme.id, theme.hex)
        log(`set tenant theme to ${theme.id} (${theme.hex})`)
      } else {
        clearThemeRow()
        log('cleared tenant theme row (platform pass)')
      }

      for (const mode of MODES) {
        const combo = `${theme.id}|${mode}`
        const wanted = screens.filter((s) => {
          if (!s.path) return false
          if (onlyScreens) return onlyScreens.includes(s.name)
          if (onlyTier && s.tier !== onlyTier) return false
          return s.tier === 'A' || TIER_B_COMBOS.has(combo)
        })
        if (!wanted.length) continue

        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState })
        await context.addInitScript((m: string) => {
          try {
            localStorage.setItem('theme', m)
            localStorage.setItem('tours-disabled', 'true')
          } catch {
            /* ignore */
          }
        }, mode)
        const page = await context.newPage()
        try {
          await pollThemeApplied(page, `${baseUrl}/en/dashboard/admin`, theme.hex, mode)
          log(`theme ${theme.id}/${mode} converged — ${wanted.length} screens`)
          for (const screen of wanted) {
            const base = screen.platform ? platformBase : baseUrl
            await shoot(
              page,
              `${base}${screen.path}`,
              path.join(outDir, `${screen.name}-${theme.id}-${mode}.png`),
              screen,
              axeResults
            )
            pngCount++
          }
        } catch (err) {
          log(`COMBO FAILED ${combo}: ${err}`)
          axeResults[`combo-${theme.id}-${mode}`] = { error: String(err) }
        } finally {
          await context.close()
        }
      }
    }
  } finally {
    if (browser) await browser.close()
    restoreThemeRow(originalRow)
    const after = scalar(
      `SELECT setting_value::text FROM tenant_settings WHERE tenant_id='${TENANT_ID}' AND setting_key='theme_preset'`
    )
    log(`restored theme_preset row: ${after === null ? '(none)' : after} (matches original: ${after === originalRow})`)
    if (after !== originalRow) console.error('WARNING: restored row does not match the original snapshot')
  }

  // Named per run: two passes into one outDir silently overwrote each other's
  // results the first time this harness was used (#764 surface 2).
  const axeKey = (onlyScreens ?? [onlyTier ?? 'all']).join('+')
  const axeFile = path.join(outDir, `axe-color-contrast-${axeKey}.json`)
  writeFileSync(axeFile, `${JSON.stringify(axeResults, null, 2)}\n`)
  log(`wrote ${axeFile}`)
  log(`done: ${pngCount} PNGs in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
}

main().catch((err) => {
  console.error('[staff-matrix] FAILED', err)
  process.exit(1)
})
