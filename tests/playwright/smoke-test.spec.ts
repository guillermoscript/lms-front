import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { login } from './utils/auth'
import { BASE, TENANT_BASE, LOCALE, ACCOUNTS } from './utils/constants'

/**
 * Smoke Test — 3 personas (student / teacher / admin)
 *
 * Breadth check, not deep flow testing. For every top-level page:
 *   1. Navigate and confirm it loads (HTTP < 400, no error boundary).
 *   2. Perform one safe "key action" (click the first non-destructive
 *      button in the main content) and confirm the page does not crash.
 *   3. Capture console errors and uncaught page exceptions.
 *
 * Findings are written to docs/SMOKE_TEST_LOG.md (latest run prepended).
 *
 * Run:  npx playwright test smoke-test --project=desktop-chromium
 */

type PageDef = { name: string; path: string }
type Persona = { name: string; base: string; email: string; password: string; pages: PageDef[] }

const STUDENT_PAGES: PageDef[] = [
  { name: 'Dashboard', path: '/dashboard/student' },
  { name: 'My Courses', path: '/dashboard/student/courses' },
  { name: 'Browse', path: '/dashboard/student/browse' },
  { name: 'Progress', path: '/dashboard/student/progress' },
  { name: 'Certificates', path: '/dashboard/student/certificates' },
  { name: 'Payments', path: '/dashboard/student/payments' },
  { name: 'Community', path: '/dashboard/student/community' },
  { name: 'Store', path: '/dashboard/student/store' },
  { name: 'Profile', path: '/dashboard/student/profile' },
]

const TEACHER_PAGES: PageDef[] = [
  { name: 'Dashboard', path: '/dashboard/teacher' },
  { name: 'Courses', path: '/dashboard/teacher/courses' },
  { name: 'Templates', path: '/dashboard/teacher/templates' },
  { name: 'Community', path: '/dashboard/teacher/community' },
  { name: 'Revenue', path: '/dashboard/teacher/revenue' },
  { name: 'API Tokens', path: '/dashboard/teacher/api-tokens' },
]

const ADMIN_PAGES: PageDef[] = [
  { name: 'Dashboard', path: '/dashboard/admin' },
  { name: 'Courses', path: '/dashboard/admin/courses' },
  { name: 'Products', path: '/dashboard/admin/products' },
  { name: 'Plans', path: '/dashboard/admin/plans' },
  { name: 'Users', path: '/dashboard/admin/users' },
  { name: 'Enrollments', path: '/dashboard/admin/enrollments' },
  { name: 'Transactions', path: '/dashboard/admin/transactions' },
  { name: 'Subscriptions', path: '/dashboard/admin/subscriptions' },
  { name: 'Payment Requests', path: '/dashboard/admin/payment-requests' },
  { name: 'Revenue', path: '/dashboard/admin/revenue' },
  { name: 'Monetization', path: '/dashboard/admin/monetization' },
  { name: 'Analytics', path: '/dashboard/admin/analytics' },
  { name: 'Categories', path: '/dashboard/admin/categories' },
  { name: 'Community', path: '/dashboard/admin/community' },
  { name: 'Notifications', path: '/dashboard/admin/notifications' },
  { name: 'Settings', path: '/dashboard/admin/settings' },
  { name: 'Appearance', path: '/dashboard/admin/appearance' },
  { name: 'Billing', path: '/dashboard/admin/billing' },
  { name: 'Landing Page', path: '/dashboard/admin/landing-page' },
  { name: 'API Tokens', path: '/dashboard/admin/api-tokens' },
]

const PERSONAS: Persona[] = [
  { name: 'student', base: BASE, email: ACCOUNTS.student.email, password: ACCOUNTS.student.password, pages: STUDENT_PAGES },
  { name: 'teacher', base: BASE, email: ACCOUNTS.teacher.email, password: ACCOUNTS.teacher.password, pages: TEACHER_PAGES },
  { name: 'admin', base: TENANT_BASE, email: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password, pages: ADMIN_PAGES },
]

/** Text that, if present, means an error boundary rendered. */
const ERROR_BOUNDARY_TEXT = ['Something went wrong', 'An unspecified error occurred']

/** Console-error substrings treated as benign noise (not counted as warnings). */
const CONSOLE_NOISE = ['favicon', 'ResizeObserver', '/_next/static', 'web-vitals', 'Download the React DevTools']

type PageResult = {
  persona: string
  name: string
  path: string
  status: 'PASS' | 'WARN' | 'FAIL'
  httpStatus: number | null
  errorBoundary: boolean
  action: string
  consoleErrors: string[]
  pageErrors: string[]
  notes: string[]
}

const results: PageResult[] = []
let loginFailures: string[] = []

function isNoise(text: string): boolean {
  return CONSOLE_NOISE.some((n) => text.includes(n))
}

/** Click the first safe, non-destructive button in the main content. */
async function performKeyAction(page: Page): Promise<string> {
  const candidate = page
    .locator('main button:visible, [role="main"] button:visible')
    .filter({ hasNotText: /delete|remove|sign ?out|log ?out|archive|disable|deactivate|reset|revoke/i })
    .first()

  const count = await candidate.count().catch(() => 0)
  if (count === 0) return 'no actionable button found'

  const label = ((await candidate.textContent().catch(() => '')) || '').trim().slice(0, 40) || '(unlabeled button)'
  const enabled = await candidate.isEnabled().catch(() => false)
  if (!enabled) return `skipped (disabled): "${label}"`

  try {
    await candidate.click({ timeout: 3000 })
  } catch {
    // base-ui buttons sometimes reject Playwright clicks — fall back to DOM click
    await candidate.evaluate((el) => (el as HTMLElement).click()).catch(() => {})
  }
  await page.waitForTimeout(900)
  return `clicked "${label}"`
}

async function smokeCheckPage(page: Page, persona: Persona, def: PageDef) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const notes: string[] = []

  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() === 'error' && !isNoise(msg.text())) consoleErrors.push(msg.text())
  }
  const onPageError = (err: Error) => pageErrors.push(err.message)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  let httpStatus: number | null = null
  let action = '—'

  try {
    const resp = await page.goto(`${persona.base}/${LOCALE}${def.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    httpStatus = resp ? resp.status() : null
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {
      notes.push('networkidle not reached within 12s')
    })
    await page.waitForTimeout(600)

    action = await performKeyAction(page).catch((e) => `action error: ${String(e).slice(0, 80)}`)
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  } catch (e) {
    notes.push(`navigation error: ${String(e).slice(0, 120)}`)
  }

  // Use innerText (visible text only) — textContent picks up <script>/__NEXT_DATA__
  // which embeds all translation strings including error boundary copy, causing false positives.
  const bodyText = (await page.evaluate(() => document.body.innerText).catch(() => '')) || ''
  const errorBoundary = ERROR_BOUNDARY_TEXT.some((t) => bodyText.includes(t))
  const isNotFound = bodyText.includes('404') && /not\s*found/i.test(bodyText)
  if (isNotFound) notes.push('page rendered a 404 / not-found view')

  page.off('console', onConsole)
  page.off('pageerror', onPageError)

  let status: PageResult['status'] = 'PASS'
  if ((httpStatus !== null && httpStatus >= 400) || errorBoundary || pageErrors.length > 0 || isNotFound) {
    status = 'FAIL'
  } else if (consoleErrors.length > 0) {
    status = 'WARN'
  }

  results.push({
    persona: persona.name,
    name: def.name,
    path: def.path,
    status,
    httpStatus,
    errorBoundary,
    action,
    consoleErrors,
    pageErrors,
    notes,
  })
}

test.describe('Smoke Test — 3 personas', () => {
  test('student / teacher / admin — all top-level pages', async ({ browser }) => {
    test.setTimeout(600_000)

    for (const persona of PERSONAS) {
      const context = await browser.newContext()
      const page = await context.newPage()
      // Auto-dismiss any native dialog so a key-action click can't freeze the run.
      page.on('dialog', (d) => d.dismiss().catch(() => {}))

      try {
        await login(page, persona.email, persona.password, persona.base)
        console.log(`✅ [${persona.name}] logged in`)
      } catch (e) {
        const msg = `❌ [${persona.name}] LOGIN FAILED: ${String(e).slice(0, 160)}`
        console.log(msg)
        loginFailures.push(msg)
        await context.close()
        continue
      }

      for (const def of persona.pages) {
        await smokeCheckPage(page, persona, def)
        const r = results[results.length - 1]
        console.log(`  ${r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌'} [${persona.name}] ${def.name} — ${r.status} (${def.path})`)
      }

      await context.close()
    }

    writeLog()

    // Surface failures in the Playwright report without aborting the run.
    const failed = results.filter((r) => r.status === 'FAIL')
    expect.soft(loginFailures, `Login failures:\n${loginFailures.join('\n')}`).toEqual([])
    expect
      .soft(failed.map((r) => `${r.persona}:${r.name}`), `${failed.length} page(s) failed — see docs/SMOKE_TEST_LOG.md`)
      .toEqual([])
  })
})

function writeLog() {
  const now = new Date()
  const stamp = now.toISOString()
  const personas = [...new Set(results.map((r) => r.persona))]

  const lines: string[] = []
  lines.push(`## Smoke Run — ${stamp}`)
  lines.push('')

  const total = results.length
  const pass = results.filter((r) => r.status === 'PASS').length
  const warn = results.filter((r) => r.status === 'WARN').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  lines.push(`**Summary:** ${pass}/${total} PASS · ${warn} WARN · ${fail} FAIL` + (loginFailures.length ? ` · ${loginFailures.length} LOGIN FAILURE(S)` : ''))
  lines.push('')

  if (loginFailures.length) {
    lines.push('### ⛔ Login failures')
    loginFailures.forEach((f) => lines.push(`- ${f}`))
    lines.push('')
  }

  for (const p of personas) {
    const rows = results.filter((r) => r.persona === p)
    lines.push(`### ${p.charAt(0).toUpperCase() + p.slice(1)} (${rows.filter((r) => r.status === 'PASS').length}/${rows.length} pass)`)
    lines.push('')
    lines.push('| Page | Path | HTTP | Result | Key action |')
    lines.push('|------|------|------|--------|------------|')
    for (const r of rows) {
      const icon = r.status === 'PASS' ? '✅ PASS' : r.status === 'WARN' ? '⚠️ WARN' : '❌ FAIL'
      lines.push(`| ${r.name} | \`${r.path}\` | ${r.httpStatus ?? '—'} | ${icon} | ${r.action} |`)
    }
    lines.push('')

    const issues = rows.filter((r) => r.status !== 'PASS')
    if (issues.length) {
      lines.push('**Details:**')
      for (const r of issues) {
        lines.push('')
        lines.push(`- **${r.name}** (\`${r.path}\`) — ${r.status}`)
        if (r.errorBoundary) lines.push(`  - 🧨 Error boundary rendered`)
        if (r.httpStatus !== null && r.httpStatus >= 400) lines.push(`  - HTTP ${r.httpStatus}`)
        r.notes.forEach((n) => lines.push(`  - note: ${n}`))
        r.pageErrors.forEach((e) => lines.push(`  - 🔴 uncaught: ${e}`))
        r.consoleErrors.slice(0, 8).forEach((e) => lines.push(`  - console.error: ${e}`))
        if (r.consoleErrors.length > 8) lines.push(`  - …and ${r.consoleErrors.length - 8} more console error(s)`)
      }
      lines.push('')
    }
  }
  lines.push('---')
  lines.push('')

  const logPath = path.resolve(__dirname, '../../docs/SMOKE_TEST_LOG.md')
  const header = `# Smoke Test Log\n\nGenerated by \`tests/playwright/smoke-test.spec.ts\`. Latest run is at the top.\n\n`
  let prior = ''
  if (fs.existsSync(logPath)) {
    prior = fs.readFileSync(logPath, 'utf8').replace(/^# Smoke Test Log[\s\S]*?\n\n/, '')
  }
  fs.writeFileSync(logPath, header + lines.join('\n') + '\n' + prior)
  console.log(`\n📝 Findings written to docs/SMOKE_TEST_LOG.md`)
}
