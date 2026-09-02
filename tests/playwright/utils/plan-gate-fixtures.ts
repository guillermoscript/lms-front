/**
 * Shared fixtures for the plan-gate regression specs (#296 Phase 5).
 *
 * Every spec gets its OWN tenant and its OWN throwaway plan row so the files
 * can run under CI's `fullyParallel` without stepping on each other, and so
 * the seeded default / code-academy tenants — load-bearing for a dozen other
 * specs — are never moved off their plan.
 *
 * The throwaway plan is the trick that keeps these specs cheap: the DB
 * triggers (#658), `getTenantPlanLimits` and the cutoff reconcile all read
 * `platform_plans.limits` by `tenants.plan` slug with NO `is_active` filter,
 * so a hidden plan with `max_courses: 1` puts a tenant "at the cap" with one
 * row instead of fifty seeded students.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { BASE, LOCALE } from './constants'

export const SEEDED = {
  /** owner@e2etest.com — default-tenant admin + super admin. */
  owner: { id: 'a1000000-0000-0000-0000-000000000002', email: 'owner@e2etest.com', password: 'password123' },
  /** student@e2etest.com — default-tenant student. */
  student: { id: 'a1000000-0000-0000-0000-000000000001', email: 'student@e2etest.com', password: 'password123' },
  /** alice@student.com — code-academy student, NOT a member of any QA tenant. */
  alice: { id: 'a1000000-0000-0000-0000-000000000004', email: 'alice@student.com', password: 'password123' },
} as const

export const DAY_MS = 24 * 60 * 60 * 1000

export function getAdmin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** `http://lvh.me:3005` → `http://<slug>.lvh.me:3005` — the tenant's subdomain. */
export function tenantBase(slug: string): string {
  return BASE.replace('://', `://${slug}.`)
}

export interface QaTenant {
  id: string
  slug: string
  name: string
  /** Hidden plan row owned by this spec. */
  planSlug: string
}

export interface TinyPlanLimits {
  max_courses: number
  max_students: number
}

/**
 * A hidden plan row with the given limits and Free's feature set. `is_active`
 * is false so it never shows on the pricing page mid-run; every enforcement
 * path reads the plan without that filter.
 */
export async function upsertTinyPlan(admin: SupabaseClient, slug: string, limits: TinyPlanLimits) {
  const { data: free } = await admin.from('platform_plans').select('features').eq('slug', 'free').single()
  const { error } = await admin.from('platform_plans').upsert(
    {
      slug,
      name: `E2E ${slug}`,
      description: 'Throwaway plan for the plan-gate regression suite',
      price_monthly: 0,
      price_yearly: 0,
      transaction_fee_percent: 10,
      sort_order: 999,
      is_active: false,
      features: free?.features ?? {},
      limits: { ...limits, transaction_fee: 10 },
    },
    { onConflict: 'slug' },
  )
  if (error) throw new Error(`could not upsert plan ${slug}: ${error.message}`)
}

export async function createQaTenant(admin: SupabaseClient, t: QaTenant, plan = 'free') {
  const { error } = await admin.from('tenants').upsert(
    { id: t.id, slug: t.slug, name: t.name, plan, status: 'active', billing_status: 'free', access_cutoff_at: null },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`could not create tenant ${t.slug}: ${error.message}`)
}

export async function setTenantPlan(admin: SupabaseClient, tenantId: string, plan: string) {
  const { error } = await admin.from('tenants').update({ plan }).eq('id', tenantId)
  if (error) throw new Error(`could not set plan ${plan}: ${error.message}`)
}

export async function addMember(
  admin: SupabaseClient,
  tenantId: string,
  userId: string,
  role: 'admin' | 'teacher' | 'student',
) {
  const { error } = await admin
    .from('tenant_users')
    .upsert({ tenant_id: tenantId, user_id: userId, role, status: 'active' }, { onConflict: 'tenant_id,user_id' })
  if (error) throw new Error(`could not add ${role} ${userId}: ${error.message}`)
}

export async function insertCourse(
  admin: SupabaseClient,
  tenantId: string,
  title: string,
  opts?: { status?: 'draft' | 'published' | 'archived'; authorId?: string },
): Promise<number> {
  const { data, error } = await admin
    .from('courses')
    .insert({
      title,
      tenant_id: tenantId,
      author_id: opts?.authorId ?? SEEDED.owner.id,
      status: opts?.status ?? 'published',
      description: 'Plan-gate regression fixture',
    })
    .select('course_id')
    .single()
  if (error) throw new Error(`could not insert course "${title}": ${error.message}`)
  return data.course_id as number
}

/** Everything a spec's tenant owns, then the tenant and its plan row. */
export async function destroyQaTenant(admin: SupabaseClient, t: QaTenant) {
  await admin.from('access_cutoff_notifications').delete().eq('tenant_id', t.id)
  await admin.from('entitlements').delete().eq('tenant_id', t.id)
  await admin.from('enrollments').delete().eq('tenant_id', t.id)
  await admin.from('courses').delete().eq('tenant_id', t.id)
  await admin.from('tenant_invitations').delete().eq('tenant_id', t.id)
  await admin.from('tenant_users').delete().eq('tenant_id', t.id)
  await admin.from('tenant_settings').delete().eq('tenant_id', t.id)
  await admin.from('platform_subscriptions').delete().eq('tenant_id', t.id)
  await admin.from('platform_payment_requests').delete().eq('tenant_id', t.id)
  await admin.from('revenue_splits').delete().eq('tenant_id', t.id)
  await admin.from('tenant_billing_customers').delete().eq('tenant_id', t.id)
  await admin.from('tenants').delete().eq('id', t.id)
  await admin.from('platform_plans').delete().eq('slug', t.planSlug)
}

export interface Usage {
  courses: number
  students: number
  max_courses: number
  max_students: number
}

export async function usageOf(admin: SupabaseClient, tenantId: string): Promise<Usage> {
  const { data, error } = await admin.rpc('get_tenant_plan_usage', { _tenant_id: tenantId })
  if (error) throw error
  return data as Usage
}

export async function tenantRow(admin: SupabaseClient, tenantId: string) {
  const { data, error } = await admin
    .from('tenants')
    .select('plan, billing_status, access_cutoff_at, billing_period_end')
    .eq('id', tenantId)
    .single()
  if (error) throw error
  return data
}

export interface SweepResult {
  success: boolean
  scheduled: number
  cleared: number
  none: number
  errors: number
  notified: Record<string, number>
  notifyFailures: number
}

/** GET `/api/cron/enforce-plan-limits` the way pg_cron and GitHub do. */
export async function runEnforceSweep(request: import('@playwright/test').APIRequestContext): Promise<SweepResult> {
  const res = await request.get(`${BASE}/api/cron/enforce-plan-limits`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as SweepResult
}

/**
 * Login on a tenant subdomain for a user who is NOT a member there: the proxy
 * bounces them to `/join-school` instead of a dashboard, which is the page the
 * seat-limit spec wants. Mirrors `utils/auth.ts` (hydration poll + re-press),
 * only the arrival check differs.
 */
export async function loginExpectingJoinSchool(page: Page, base: string, email: string, password: string) {
  await page.goto(`${base}/${LOCALE}/auth/login`, { waitUntil: 'domcontentloaded' })
  const emailField = page.getByTestId('login-email')
  await emailField.waitFor({ state: 'visible', timeout: 30_000 })
  await expect
    .poll(
      async () => {
        await emailField.fill(email)
        await page.getByTestId('login-password').fill(password)
        await page.waitForTimeout(750)
        return emailField.inputValue()
      },
      { timeout: 45_000, intervals: [500, 1000] },
    )
    .toBe(email)

  const arrived = () => page.url().includes('/join-school')
  for (let attempt = 0; attempt < 3 && !arrived(); attempt++) {
    await page.getByTestId('login-submit').click().catch(() => undefined)
    await page.waitForURL('**/join-school**', { timeout: 20_000, waitUntil: 'commit' }).catch(() => undefined)
  }
  if (!arrived()) throw new Error(`expected /join-school after login, still at ${page.url()}`)
}
