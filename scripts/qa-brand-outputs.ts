/**
 * Before/after capture for issue #765 (epic #766, phase 5) — "what a school
 * sends out carries its brand, not the platform's hardcoded palette":
 * certificates (HTML view, PDF, template-editor preview), the verify page and
 * the OG share images (generic card, certificate card, course card).
 *
 * Sibling of scripts/qa-staff-theme-matrix.ts / qa-contact-sheet.ts — same
 * docker-exec-psql and Playwright-login conventions, but a single fixed
 * tenant pair (default = Kódigo/Amarillo theme row, code-academy = no theme
 * row → platform palette) rather than a theme matrix, because this issue is
 * about literal-colour renderers, not the CSS-variable app shell.
 *
 * Usage:
 *   npx tsx scripts/qa-brand-outputs.ts --phase before|after [--seed]
 *
 * Env:
 *   QA765_OUT   base output dir (default: ~/lms-765-qa)
 *   QA765_DEFAULT_BASE       default tenant base URL (default http://default.lvh.me:3005)
 *   QA765_CODE_ACADEMY_BASE  code-academy tenant base URL (default http://code-academy.lvh.me:3005)
 *
 * Each capture step is independent: a failure is logged into the manifest
 * with status "error" and the script continues, so one broken route never
 * blows up the whole run.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const DB_CONTAINER = 'supabase_db_lms-front'
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001' // Kódigo/Amarillo theme row
// code-academy (00000000-0000-0000-0000-000000000002) has no theme row → platform palette; referenced by base URL only.

const DEFAULT_BASE = process.env.QA765_DEFAULT_BASE ?? 'http://default.lvh.me:3005'
const CODE_ACADEMY_BASE = process.env.QA765_CODE_ACADEMY_BASE ?? 'http://code-academy.lvh.me:3005'
const OUT_ROOT = process.env.QA765_OUT ?? path.join(homedir(), 'lms-765-qa')

const STUDENT_EMAIL = 'student@e2etest.com'
const CODE_ACADEMY_ADMIN_EMAIL = 'creator@codeacademy.com'
const PASSWORD = 'password123'

const QA_DEFAULT_CODE = 'QA765DEFAULT' // fixture this script owns: tenant 001, course 1002, no template
const QA_PUBLIC_CODE = 'QA764PUBLIC' // pre-existing fixture from #764c: tenant 002, custom template

function log(msg: string) {
  console.log(`[qa-765] ${msg}`)
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

/**
 * Idempotent QA fixture: a certificate for student@e2etest.com on the default
 * tenant (Kódigo/Amarillo), course 1002 (no certificate_templates row for that
 * course → the DEFAULT design, not a custom one). template_id NULL, matching
 * the "default design" shape lib/certificate-generator.ts and
 * lib/certificates/pdf-generator.ts fall back to.
 */
function seed() {
  const studentId = scalar(
    `SELECT p.id::text FROM profiles p JOIN auth.users u ON u.id=p.id WHERE u.email='${STUDENT_EMAIL}'`
  )
  if (!studentId) throw new Error(`seed: no profile for ${STUDENT_EMAIL}`)
  const enrollmentId = scalar(
    `SELECT enrollment_id::text FROM enrollments WHERE user_id='${studentId}' AND course_id=1002 LIMIT 1`
  )
  const courseTitle = scalar(`SELECT title FROM courses WHERE course_id=1002`)
  if (!courseTitle) throw new Error('seed: course 1002 not found')

  const credentialJson = JSON.stringify({
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: { type: 'Profile', name: 'Default School', url: '' },
    issuanceDate: '2026-09-01T12:00:00.000Z',
    credentialSubject: {
      type: 'AchievementSubject',
      name: 'Test Student',
      achievement: { type: 'Achievement', name: courseTitle },
    },
  }).replace(/'/g, "''")
  const completionData = JSON.stringify({
    totalLessons: 1,
    completedLessons: 1,
    completionPercentage: 100,
  }).replace(/'/g, "''")

  psql(`
    INSERT INTO certificates (user_id, course_id, template_id, enrollment_id, verification_code, credential_json, issued_at, completion_data, tenant_id)
    VALUES ('${studentId}', 1002, NULL, ${enrollmentId ?? 'NULL'}, '${QA_DEFAULT_CODE}', '${credentialJson}'::jsonb, '2026-09-01T12:00:00.000Z', '${completionData}'::jsonb, '${DEFAULT_TENANT}')
    ON CONFLICT (verification_code) DO NOTHING
  `)
  const certId = scalar(`SELECT certificate_id::text FROM certificates WHERE verification_code='${QA_DEFAULT_CODE}'`)
  log(`seeded ${QA_DEFAULT_CODE} → certificate_id=${certId}`)
}

function discoverCertIds(): { defaultCertId: string; publicCertId: string } {
  const defaultCertId = scalar(`SELECT certificate_id::text FROM certificates WHERE verification_code='${QA_DEFAULT_CODE}'`)
  const publicCertId = scalar(`SELECT certificate_id::text FROM certificates WHERE verification_code='${QA_PUBLIC_CODE}'`)
  if (!defaultCertId) throw new Error(`${QA_DEFAULT_CODE} not seeded — run with --seed first`)
  if (!publicCertId) throw new Error(`${QA_PUBLIC_CODE} not found — expected the #764c fixture to already exist`)
  return { defaultCertId, publicCertId }
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

interface ManifestEntry {
  name: string
  status: 'ok' | 'error' | 'skipped'
  note: string
}

function record(manifest: ManifestEntry[], name: string, status: ManifestEntry['status'], note: string) {
  manifest.push({ name, status, note })
  const tag = status === 'ok' ? 'OK' : status === 'skipped' ? 'SKIP' : 'ERROR'
  log(`${tag} ${name}: ${note}`)
}

async function step(manifest: ManifestEntry[], name: string, fn: () => Promise<string>) {
  try {
    const note = await fn()
    record(manifest, name, 'ok', note)
  } catch (err) {
    record(manifest, name, 'error', String(err instanceof Error ? err.message : err))
  }
}

// ---------------------------------------------------------------------------
// Login — ported from scripts/qa-staff-theme-matrix.ts, which itself ports
// tests/playwright/utils/auth.ts: a value typed before React hydrates the
// input never reaches component state, and a click on a base-ui Button
// intermittently lands without firing the handler.
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

async function login(page: Page, baseUrl: string, email: string) {
  await page.goto(`${baseUrl}/en/auth/login`, { waitUntil: 'domcontentloaded' })
  const emailInput = page.getByTestId('login-email')
  await emailInput.waitFor({ state: 'visible', timeout: 60_000 })

  await poll(
    () => emailInput.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))),
    (v) => v === true,
    60_000,
    500,
    'the login form to hydrate'
  )

  await poll(
    async () => {
      await emailInput.fill(email)
      await page.getByTestId('login-password').fill(PASSWORD)
      await page.waitForTimeout(750)
      return emailInput.inputValue()
    },
    (v) => v === email,
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
// OG image capture — reads the real <meta property="og:image"> the app
// produces (root layout / verify page / course page generateMetadata), then
// downloads that exact URL, rather than reconstructing query params by hand.
// ---------------------------------------------------------------------------

async function extractOgImage(context: BrowserContext, pageUrl: string): Promise<{ imageUrl: string; origin: string }> {
  const page = await context.newPage()
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' })
    const content = await page.locator('meta[property="og:image"]').first().getAttribute('content')
    if (!content) throw new Error('no og:image meta tag found')
    const origin = new URL(pageUrl).origin
    const imageUrl = new URL(content, origin).toString()
    return { imageUrl, origin }
  } finally {
    await page.close()
  }
}

async function downloadOg(context: BrowserContext, pageUrl: string, outPngPath: string): Promise<string> {
  const { imageUrl } = await extractOgImage(context, pageUrl)
  const res = await context.request.get(imageUrl)
  if (!res.ok()) throw new Error(`GET ${imageUrl} → ${res.status()}`)
  const body = await res.body()
  writeFileSync(outPngPath, body)
  writeFileSync(outPngPath.replace(/\.png$/, '-url.txt'), `${pageUrl}\n${imageUrl}\n`)
  return imageUrl
}

// ---------------------------------------------------------------------------
// PDF → PNG via macOS `sips` (renders page 1).
// ---------------------------------------------------------------------------

function pdfToPng(pdfPath: string, pngPath: string) {
  execFileSync('sips', ['-s', 'format', 'png', pdfPath, '--out', pngPath], { stdio: 'pipe' })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2)
  const phaseIdx = args.indexOf('--phase')
  const phase = phaseIdx >= 0 ? args[phaseIdx + 1] : undefined
  if (phase !== 'before' && phase !== 'after') {
    console.error('Usage: npx tsx scripts/qa-brand-outputs.ts --phase before|after [--seed]')
    process.exit(1)
  }
  return { phase, doSeed: args.includes('--seed') }
}

async function main() {
  const { phase, doSeed } = parseArgs()
  const outDir = path.join(OUT_ROOT, phase, 'app')
  mkdirSync(outDir, { recursive: true })
  const manifest: ManifestEntry[] = []

  if (doSeed) seed()
  const { defaultCertId, publicCertId } = discoverCertIds()
  log(`fixtures: default=${defaultCertId} (${QA_DEFAULT_CODE}), public=${publicCertId} (${QA_PUBLIC_CODE})`)

  let browser: Browser | null = null
  try {
    browser = await chromium.launch()

    // -----------------------------------------------------------------
    // 3a. OG PNGs — generic card, certificate card (both tenants), course card
    // -----------------------------------------------------------------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      await step(manifest, 'og-generic-default', async () => {
        const url = await downloadOg(ctx, `${DEFAULT_BASE}/en`, path.join(outDir, 'og-generic-default.png'))
        return url
      })
      await step(manifest, 'og-generic-code-academy', async () => {
        const url = await downloadOg(ctx, `${CODE_ACADEMY_BASE}/en`, path.join(outDir, 'og-generic-code-academy.png'))
        return url
      })
      await step(manifest, 'og-certificate-default', async () => {
        const url = await downloadOg(
          ctx,
          `${DEFAULT_BASE}/en/verify/${QA_DEFAULT_CODE}`,
          path.join(outDir, 'og-certificate-default.png')
        )
        return url
      })
      await step(manifest, 'og-certificate-code-academy', async () => {
        const url = await downloadOg(
          ctx,
          `${CODE_ACADEMY_BASE}/en/verify/${QA_PUBLIC_CODE}`,
          path.join(outDir, 'og-certificate-code-academy.png')
        )
        return url
      })
      await step(manifest, 'og-course-1002', async () => {
        const url = await downloadOg(
          ctx,
          `${DEFAULT_BASE}/en/courses/1002`,
          path.join(outDir, 'og-course-1002.png')
        )
        return url
      })
      await ctx.close()
    }

    // -----------------------------------------------------------------
    // 3b. Certificate HTML view — public route, no auth
    // -----------------------------------------------------------------
    {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const page = await ctx.newPage()
      await step(manifest, 'cert-html-view-default', async () => {
        const url = `${DEFAULT_BASE}/api/certificates/view/${QA_DEFAULT_CODE}`
        await page.goto(url, { waitUntil: 'load' })
        await page.waitForTimeout(500)
        await page.screenshot({ path: path.join(outDir, 'cert-html-view-default.png'), fullPage: true })
        return url
      })
      await step(manifest, 'cert-html-view-code-academy', async () => {
        const url = `${CODE_ACADEMY_BASE}/api/certificates/view/${QA_PUBLIC_CODE}`
        await page.goto(url, { waitUntil: 'load' })
        await page.waitForTimeout(500)
        await page.screenshot({ path: path.join(outDir, 'cert-html-view-code-academy.png'), fullPage: true })
        return url
      })
      await ctx.close()
    }

    // -----------------------------------------------------------------
    // 3c. Certificate PDF (authenticated) → PDF + PNG (page 1 via sips)
    // -----------------------------------------------------------------
    await step(manifest, 'cert-pdf-default', async () => {
      const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } })
      try {
        const loginPage = await ctx.newPage()
        await login(loginPage, DEFAULT_BASE, STUDENT_EMAIL)
        await loginPage.close()
        const url = `${DEFAULT_BASE}/api/certificates/${defaultCertId}?format=pdf`
        const res = await ctx.request.get(url)
        if (!res.ok()) throw new Error(`GET ${url} → ${res.status()}`)
        const pdfPath = path.join(outDir, 'cert-pdf-default.pdf')
        writeFileSync(pdfPath, await res.body())
        pdfToPng(pdfPath, path.join(outDir, 'cert-pdf-default.png'))
        return `${url} (signed in as ${STUDENT_EMAIL}, the certificate's owner)`
      } finally {
        await ctx.close()
      }
    })
    await step(manifest, 'cert-pdf-code-academy', async () => {
      const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } })
      try {
        const loginPage = await ctx.newPage()
        await login(loginPage, CODE_ACADEMY_BASE, CODE_ACADEMY_ADMIN_EMAIL)
        await loginPage.close()
        const url = `${CODE_ACADEMY_BASE}/api/certificates/${publicCertId}?format=pdf`
        const res = await ctx.request.get(url)
        if (!res.ok()) throw new Error(`GET ${url} → ${res.status()}`)
        const pdfPath = path.join(outDir, 'cert-pdf-code-academy.pdf')
        writeFileSync(pdfPath, await res.body())
        pdfToPng(pdfPath, path.join(outDir, 'cert-pdf-code-academy.png'))
        return `${url} (signed in as ${CODE_ACADEMY_ADMIN_EMAIL}, tenant admin — not the cert owner alice@student.com)`
      } finally {
        await ctx.close()
      }
    })

    // -----------------------------------------------------------------
    // 3d. Badge PNG — no route exposes one
    // -----------------------------------------------------------------
    record(
      manifest,
      'badge-png',
      'skipped',
      'no route renders certificates.badge_image_url as an image — only /api/certificates/verify/[code] returns it as a JSON field (null in both fixtures) and /api/og produces the share card, not a badge'
    )

    // -----------------------------------------------------------------
    // 3e. Verify pages, 1280 wide, light mode
    // -----------------------------------------------------------------
    {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 1000 },
        colorScheme: 'light',
      })
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('theme', 'light')
        } catch {
          /* ignore */
        }
      })
      const page = await ctx.newPage()
      await step(manifest, 'verify-page-default', async () => {
        const url = `${DEFAULT_BASE}/en/verify/${QA_DEFAULT_CODE}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1200)
        await page.screenshot({ path: path.join(outDir, 'verify-page-default.png'), fullPage: true })
        return url
      })
      await step(manifest, 'verify-page-code-academy', async () => {
        const url = `${CODE_ACADEMY_BASE}/en/verify/${QA_PUBLIC_CODE}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1200)
        await page.screenshot({ path: path.join(outDir, 'verify-page-code-academy.png'), fullPage: true })
        return url
      })
      await ctx.close()
    }

    // -----------------------------------------------------------------
    // 3f. Certificate template editor preview — owner@e2etest.com, course 1002
    // (no template row → the form's own defaults), default tenant (Kódigo).
    // -----------------------------------------------------------------
    await step(manifest, 'cert-template-editor-preview', async () => {
      const ctx = await browser!.newContext({ viewport: { width: 1440, height: 1000 } })
      try {
        const page = await ctx.newPage()
        await login(page, DEFAULT_BASE, 'owner@e2etest.com')
        const url = `${DEFAULT_BASE}/en/dashboard/teacher/courses/1002/certificates/settings`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(2000)
        const preview = page.locator('.rounded-xl.border-2.bg-white.shadow-xl').first()
        await preview.waitFor({ state: 'visible', timeout: 15_000 })
        await preview.screenshot({ path: path.join(outDir, 'cert-template-editor-preview.png') })
        // Also the full page, for context around the preview panel.
        await page.screenshot({ path: path.join(outDir, 'cert-template-editor-full.png'), fullPage: true })
        return url
      } finally {
        await ctx.close()
      }
    })
  } finally {
    if (browser) await browser.close()
  }

  const manifestPath = path.join(outDir, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify({ phase, capturedAt: new Date().toISOString(), manifest }, null, 2)}\n`)
  const okCount = manifest.filter((m) => m.status === 'ok').length
  const errCount = manifest.filter((m) => m.status === 'error').length
  log(`done: ${okCount} ok, ${errCount} error, ${manifest.length - okCount - errCount} skipped — wrote ${manifestPath}`)
  if (errCount > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('[qa-765] FAILED', err)
  process.exit(1)
})
