/**
 * Issue #660 — the platform billing-health page shows the last
 * `enforce-plan-limits` run from the pg_cron ledger (`cron_runs`).
 *
 * The service-role client invokes the scheduler function directly; without the
 * Vault secrets (the local default) that records an `unconfigured` run, which
 * is exactly the state the page must make loud rather than hide.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAsSuperAdmin } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

test.describe('Platform billing health — plan-limit sweep (#660)', () => {
  test('shows the latest pg_cron invocation and its state', async ({ page, isMobile }) => {
    test.skip(isMobile, 'platform console is desktop-only')
    test.setTimeout(120_000)

    const { data: runId, error } = await admin.rpc('invoke_cron_route', { _route: 'enforce-plan-limits' })
    expect(error).toBeNull()
    expect(typeof runId).toBe('number')

    const { data: run } = await admin
      .from('cron_runs')
      .select('error, completed_at, request_id')
      .eq('id', runId as number)
      .single()
    const expectedState = run?.error?.startsWith('vault secrets') ? 'unconfigured' : run?.completed_at ? 'ok' : 'running'

    await loginAsSuperAdmin(page, BASE)
    await page.goto(`${BASE}/${LOCALE}/platform/billing-health`)
    await expect(page.getByTestId('platform-billing-health')).toBeVisible()

    const section = page.getByTestId('billing-health-sweep')
    await expect(section).toBeVisible()
    await expect(section.locator('[data-state]')).toHaveAttribute('data-state', expectedState)
    await expect(section.getByTestId('billing-health-sweep-state')).not.toHaveText('Never run')
    if (expectedState === 'unconfigured') {
      await expect(section.getByTestId('billing-health-sweep-error')).toContainText('vault secrets')
    }

    await page.screenshot({ path: 'test-results/billing-health-sweep.png', fullPage: true })
  })
})
