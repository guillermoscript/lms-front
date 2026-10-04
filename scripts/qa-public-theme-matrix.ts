/**
 * Screenshot matrix for issue #764 surface 2 — the school-facing PUBLIC pages.
 *
 * Sibling of scripts/tmp-theme-matrix.ts (the learner matrix from PR #770).
 * Differences: these pages are unauthenticated, they live on a tenant
 * subdomain (the platform root renders the marketing home instead), and the
 * Puck landing route changes the whole public shell, so it is captured in its
 * own pass.
 *
 * Flips the `code-academy` tenant's theme_preset row through each kit plus a
 * "platform" pass with no row, in light and dark, and screenshots every public
 * screen for each combination.
 *
 * Usage: npx tsx scripts/qa-public-theme-matrix.ts <baseUrl> <outDir>
 *   e.g. npx tsx scripts/qa-public-theme-matrix.ts http://code-academy.lvh.me:3005 /tmp/764b-before
 *
 * Env:
 *   MATRIX_THEMES=estructura,platform   limit the theme passes
 *   MATRIX_SCREENS=course,pricing       limit the screens
 *   MATRIX_PUCK=1                       also run the Puck landing pass (see below)
 */

import { chromium, type Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const TENANT_ID = '00000000-0000-0000-0000-000000000002' // code-academy
const DB_CONTAINER = 'supabase_db_lms-front'

const THEMES: { id: string; hex: string | null }[] = [
  { id: 'estructura', hex: '#3A50B8' },
  { id: 'andina', hex: '#2F6B4F' },
  { id: 'kodigo', hex: '#F2B705' },
  { id: 'luz', hex: '#C2185B' },
  { id: 'platform', hex: null },
]
const KIT_HEXES = new Set(THEMES.filter((t) => t.hex).map((t) => t.hex!.toUpperCase()))
const MODES = ['light', 'dark'] as const

function log(msg: string) {
  console.log(`[public-matrix] ${msg}`)
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
// The seed has courses, products and plans for code-academy but no certificate
// (cert issue is template-gated and the seed ships no template) and no landing
// page. Both are created here under fixed ids so a "before" run on master and
// an "after" run on the branch resolve to the same URLs, and both are left in
// place — they are local QA data.
// ---------------------------------------------------------------------------

const VERIFY_CODE = 'QA764PUBLIC'
const PUCK_SLUG = 'qa-764'

interface Fixtures {
  courseId: string
  productId: string | null
  verifyCode: string
  puckSlug: string | null
}

function ensureCertificate(): string {
  const existing = scalar(`SELECT verification_code FROM certificates WHERE verification_code='${VERIFY_CODE}'`)
  if (existing) return VERIFY_CODE

  const userId = scalar(`SELECT id FROM auth.users WHERE email='alice@student.com'`)
  const courseId = scalar(`SELECT course_id FROM courses WHERE tenant_id='${TENANT_ID}' ORDER BY course_id LIMIT 1`)
  if (!userId || !courseId) throw new Error('cannot build a certificate fixture: missing alice@student.com or a course')

  // A template makes the page render its full "issued by" chrome, and its
  // design_settings are the content colours the sweep must NOT touch.
  let templateId = scalar(`SELECT template_id FROM certificate_templates WHERE tenant_id='${TENANT_ID}' LIMIT 1`)
  if (!templateId) {
    templateId = scalar(`
      INSERT INTO certificate_templates (tenant_id, template_name, issuer_name, signature_name, signature_title, design_settings)
      VALUES ('${TENANT_ID}', 'QA764 Template', 'Code Academy Pro', 'Ada Lovelace', 'Director of Studies',
              '{"primary_color":"#1a5632","secondary_color":"#0f2b1a"}'::jsonb)
      RETURNING template_id`)
  }

  // credential_json is NOT NULL; the page falls back to it for the course name.
  psql(`
    INSERT INTO certificates (tenant_id, user_id, course_id, template_id, verification_code, issued_at,
                              completion_data, credential_json)
    VALUES ('${TENANT_ID}', '${userId}', ${courseId}, '${templateId}', '${VERIFY_CODE}', now(),
            '{"averageExamScore": 92}'::jsonb,
            '{"credentialSubject":{"achievement":{"name":"Python for Beginners"}}}'::jsonb)`)
  log(`created certificate fixture ${VERIFY_CODE}`)
  return VERIFY_CODE
}

function discoverFixtures(): Fixtures {
  const courseId = scalar(
    `SELECT course_id FROM courses WHERE tenant_id='${TENANT_ID}' AND status='published' ORDER BY course_id LIMIT 1`
  )
  if (!courseId) throw new Error(`no published course on tenant ${TENANT_ID}`)
  const productId = scalar(
    `SELECT product_id FROM products WHERE tenant_id='${TENANT_ID}' AND status='active' ORDER BY created_at LIMIT 1`
  )

  let verifyCode: string
  try {
    verifyCode = ensureCertificate()
  } catch (err) {
    log(`SKIP verify screen: ${err}`)
    verifyCode = ''
  }

  const puckSlug = scalar(
    `SELECT slug FROM landing_pages WHERE tenant_id='${TENANT_ID}' AND is_published=true AND slug='${PUCK_SLUG}'`
  )

  return { courseId, productId, verifyCode, puckSlug }
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
  const deadline = Date.now() + 90_000
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
    await page.waitForTimeout(4000)
  }
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

async function shoot(page: Page, url: string, outPath: string, axeResults: Record<string, unknown>) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal').forEach((el) => el.remove())
    document.querySelectorAll('[data-sonner-toaster]').forEach((el) => el.remove())
  })
  await page.screenshot({ path: outPath, fullPage: true })
  log(`wrote ${outPath}`)
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
    console.error('Usage: npx tsx scripts/qa-public-theme-matrix.ts <baseUrl> <outDir>')
    process.exit(1)
  }
  mkdirSync(outDir, { recursive: true })

  const startedAt = Date.now()
  const fixtures = discoverFixtures()
  log(`fixtures: ${JSON.stringify(fixtures)}`)

  const wantPuck = process.env.MATRIX_PUCK === '1'
  const screens: { name: string; path: string | null; skipReason?: string }[] = [
    // The tenant root renders SchoolLandingPage (or a Puck page when one is
    // published — see the MATRIX_PUCK note below).
    { name: 'landing', path: `/en` },
    { name: 'catalog', path: `/en/courses` },
    { name: 'course', path: `/en/courses/${fixtures.courseId}` },
    { name: 'pricing', path: `/en/pricing` },
    fixtures.productId
      ? { name: 'product', path: `/en/products/${fixtures.productId}` }
      : { name: 'product', path: null, skipReason: 'no active product on code-academy' },
    fixtures.verifyCode
      ? { name: 'verify', path: `/en/verify/${fixtures.verifyCode}` }
      : { name: 'verify', path: null, skipReason: 'certificate fixture could not be created' },
    { name: 'verify-notfound', path: `/en/verify/NOPE-${Math.abs(0)}0000` },
    { name: 'join-school', path: `/en/join-school` },
  ]
  if (wantPuck) {
    // A published landing page makes PublicLayout drop the navbar/footer for
    // EVERY public route, so the Puck pass must run on its own.
    if (fixtures.puckSlug) screens.push({ name: 'puck', path: `/en/p/${fixtures.puckSlug}` })
    else log(`SKIP puck screen: no published landing_pages row with slug '${PUCK_SLUG}'`)
  }

  const onlyScreens = process.env.MATRIX_SCREENS?.split(',').map((s) => s.trim())
  for (const s of screens) if (s.skipReason) log(`SKIP ${s.name}: ${s.skipReason}`)

  const originalRow = scalar(
    `SELECT setting_value::text FROM tenant_settings WHERE tenant_id='${TENANT_ID}' AND setting_key='theme_preset'`
  )
  log(`original theme_preset row: ${originalRow === null ? '(none)' : originalRow}`)

  const axeResults: Record<string, unknown> = {}
  let pngCount = 0
  const browser = await chromium.launch()
  try {
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
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
        await context.addInitScript((m: string) => {
          try {
            localStorage.setItem('theme', m)
          } catch {
            /* ignore */
          }
        }, mode)
        const page = await context.newPage()
        try {
          await pollThemeApplied(page, `${baseUrl}/en/courses`, theme.hex, mode)
          log(`theme ${theme.id}/${mode} converged`)
          for (const screen of screens) {
            if (!screen.path) continue
            if (onlyScreens && !onlyScreens.includes(screen.name)) continue
            await shoot(
              page,
              `${baseUrl}${screen.path}`,
              path.join(outDir, `${screen.name}-${theme.id}-${mode}.png`),
              axeResults
            )
            pngCount++
          }
        } finally {
          await context.close()
        }
      }
    }
  } finally {
    await browser.close()
    restoreThemeRow(originalRow)
    const after = scalar(
      `SELECT setting_value::text FROM tenant_settings WHERE tenant_id='${TENANT_ID}' AND setting_key='theme_preset'`
    )
    log(`restored theme_preset row: ${after === null ? '(none)' : after} (matches original: ${after === originalRow})`)
    if (after !== originalRow) console.error('WARNING: restored row does not match the original snapshot')
  }

  // Keyed by the screens this run actually captured: the Puck pass runs into the
  // same outDir as the main pass, and a fixed filename let the second run
  // silently overwrite the first one's results.
  const axeKey = (onlyScreens ?? screens.filter((s) => s.path).map((s) => s.name)).join('+')
  const axeFile = path.join(outDir, `axe-color-contrast-${axeKey}.json`)
  writeFileSync(axeFile, `${JSON.stringify(axeResults, null, 2)}\n`)
  log(`wrote ${axeFile}`)
  log(`done: ${pngCount} PNGs in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
}

main().catch((err) => {
  console.error('[public-matrix] FAILED', err)
  process.exit(1)
})
