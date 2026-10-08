import 'server-only'

/**
 * Page Architect business context (design §3.5 "Data tools" / "Preload", critique C3/C4).
 *
 * Everything here runs AFTER the route's admin check, on the service-role client with an
 * explicit tenant filter (C3): the user's RLS client keys `landing_pages` and friends on the
 * JWT's tenant claim, and a mismatched claim reads back EMPTY rather than denied, which would
 * let the AI write a page around invented offers. Course/product/plan shapes come from the
 * shared landing-data resolvers (C4), so the AI binds exactly what the public render shows;
 * drafts are included but flagged `status: 'draft'`.
 *
 * `formatBusinessContext` renders the ≤3k-character preload for the system prompt, wrapped
 * in `<tenant_data>`: titles and descriptions are written by the school (and reviews by
 * students), so the prompt treats them as data, never instructions.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getLandingCourses,
  getLandingPlans,
  getLandingProducts,
  getLandingStats,
  getLandingTeachers,
  getLandingTestimonials,
} from '@/lib/puck/utils/landing-data'
import type { LandingCourse, LandingPlan, LandingProduct, LandingStats } from '@/lib/puck/types'
import { parseStoredKitTheme, SCHOOL_THEME_SETTING_KEY } from '@/lib/themes/kit'
import type { PageData, RefIdSets } from '@lms/core'

// The typed builder fights the column lists below; rows are cast at the edge.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export type PageLocale = 'en' | 'es'

/** Columns read for the school profile. Exported so tests can pin them. */
export const TENANT_PROFILE_COLUMNS = 'id, name, logo_url'
export const LANDING_PAGE_COLUMNS = 'page_id, tenant_id, title, slug, is_published, puck_data, updated_at'

/** How many courses / products the preload and the data tools look at. */
export const CONTEXT_COURSE_LIMIT = 50
export const CONTEXT_PRODUCT_LIMIT = 50
/** Ref-id sets are id-only reads, capped well above any real catalogue. */
export const REF_ID_LIMIT = 2000

export interface SchoolProfile {
  name: string
  logoUrl: string | null
  /** The page language for this turn. */
  locale: PageLocale
  /** The school's stored theme kit, or null (platform palette). */
  theme: { preset: string; primary: string } | null
  stats: LandingStats
  testimonialCount: number
  teacherCount: number
}

export interface PageBuilderContext {
  tenantId: string
  locale: PageLocale
  school: SchoolProfile
  /** Newest courses, drafts included (flagged). */
  courses: LandingCourse[]
  products: LandingProduct[]
  plans: LandingPlan[]
  /** Every id this school may bind (ref validation). */
  refs: RefIdSets
}

export interface LandingPageRow {
  pageId: string
  title: string
  slug: string
  isPublished: boolean
  puckData: PageData | null
  updatedAt: string | null
}

async function settle<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise
  } catch (err) {
    console.error('[page-builder] context read failed:', err instanceof Error ? err.name : typeof err)
    return fallback
  }
}

/** The page being edited, only when it belongs to this tenant. */
export async function loadLandingPage(tenantId: string, pageId: string): Promise<LandingPageRow | null> {
  const admin = createAdminClient() as AdminClient
  const { data } = await admin
    .from('landing_pages')
    .select(LANDING_PAGE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('page_id', pageId)
    .maybeSingle()
  if (!data || data.tenant_id !== tenantId) return null
  return {
    pageId: String(data.page_id),
    title: String(data.title ?? ''),
    slug: String(data.slug ?? ''),
    isPublished: !!data.is_published,
    puckData: data.puck_data && typeof data.puck_data === 'object' ? (data.puck_data as PageData) : null,
    updatedAt: data.updated_at ?? null,
  }
}

/** The school's name, logo, theme and live counts (`get_school_profile`). */
export async function getSchoolProfile(tenantId: string, locale: PageLocale): Promise<SchoolProfile> {
  const admin = createAdminClient() as AdminClient
  const [tenantRes, themeRes, stats, testimonials, teachers] = await Promise.all([
    admin.from('tenants').select(TENANT_PROFILE_COLUMNS).eq('id', tenantId).maybeSingle(),
    admin
      .from('tenant_settings')
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', SCHOOL_THEME_SETTING_KEY)
      .maybeSingle(),
    settle(getLandingStats(tenantId), { students: 0, courses: 0, completions: 0 }),
    settle(getLandingTestimonials(tenantId), []),
    settle(getLandingTeachers(tenantId), []),
  ])
  const tenant = tenantRes?.data as { name?: string | null; logo_url?: string | null } | null
  const theme = parseStoredKitTheme(themeRes?.data?.setting_value)
  return {
    name: tenant?.name?.trim() || 'School',
    logoUrl: tenant?.logo_url || null,
    locale,
    theme: theme ? { preset: theme.theme, primary: theme.brand } : null,
    stats,
    testimonialCount: testimonials.length,
    teacherCount: teachers.length,
  }
}

/**
 * The ids this school may bind. Courses: published or draft, not deleted (a draft binding
 * renders nothing publicly until published). Products: active. Plans: not deleted.
 */
export async function loadRefIdSets(tenantId: string): Promise<Required<RefIdSets>> {
  const admin = createAdminClient() as AdminClient
  const [courses, products, plans] = await Promise.all([
    admin
      .from('courses')
      .select('course_id')
      .eq('tenant_id', tenantId)
      .in('status', ['published', 'draft'])
      .is('deleted_at', null)
      .limit(REF_ID_LIMIT),
    admin.from('products').select('product_id').eq('tenant_id', tenantId).eq('status', 'active').limit(REF_ID_LIMIT),
    admin.from('plans').select('plan_id').eq('tenant_id', tenantId).is('deleted_at', null).limit(REF_ID_LIMIT),
  ])
  const ids = (res: { data?: unknown[] | null } | null, key: string) =>
    ((res?.data ?? []) as Record<string, unknown>[]).map((r) => String(r[key]))
  return {
    course: ids(courses, 'course_id'),
    product: ids(products, 'product_id'),
    plan: ids(plans, 'plan_id'),
  }
}

/** Everything the agent knows about the school at the start of a turn. */
export async function loadPageBuilderContext(tenantId: string, locale: PageLocale): Promise<PageBuilderContext> {
  const [school, courses, products, plans, refs] = await Promise.all([
    getSchoolProfile(tenantId, locale),
    settle(getLandingCourses(tenantId, { includeDrafts: true, limit: CONTEXT_COURSE_LIMIT }), []),
    settle(getLandingProducts(tenantId, { limit: CONTEXT_PRODUCT_LIMIT }), []),
    settle(getLandingPlans(tenantId), []),
    loadRefIdSets(tenantId),
  ])
  // A course the resolver returned is bindable even past the id cap.
  const courseIds = new Set([...(refs.course as string[]), ...courses.map((c) => c.id)])
  const productIds = new Set([...(refs.product as string[]), ...products.map((p) => p.id)])
  const planIds = new Set([...(refs.plan as string[]), ...plans.map((p) => p.id)])
  return {
    tenantId,
    locale,
    school,
    courses,
    products,
    plans,
    refs: { course: [...courseIds], product: [...productIds], plan: [...planIds] },
  }
}

// ── Prompt preload ─────────────────────────────────────────────────────────────────────

/** Tenant-written text inside the prompt: one line, no tags, capped. */
export function tenantText(value: unknown, max = 80): string {
  if (value === null || value === undefined) return ''
  const s = String(value).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export function formatPrice(price: number | null, currency: string | null): string {
  if (price === null || price <= 0) return 'free'
  return `${price} ${(currency ?? '').toUpperCase()}`.trim()
}

/** Max preload size (design §3.5: ≤3k characters). */
export const BUSINESS_CONTEXT_MAX = 3000
const MAX_PRELOAD_COURSES = 20

/**
 * The preload block for the system prompt: school profile, up to 20 courses, products and
 * plans, with ids. Wrapped in `<tenant_data>`; truncated (with a pointer to the data tools)
 * past `maxChars`.
 */
export function formatBusinessContext(ctx: PageBuilderContext, maxChars = BUSINESS_CONTEXT_MAX): string {
  const s = ctx.school
  const lines: string[] = []
  lines.push(
    `School: ${tenantText(s.name, 60)}${s.logoUrl ? ' (has a logo)' : ''}. Theme: ${s.theme ? `${s.theme.preset} ${s.theme.primary}` : 'platform default'}.`
  )
  lines.push(
    `Live counts: ${s.stats.students} students, ${s.stats.courses} published courses, ${s.stats.completions} lessons completed, ${s.testimonialCount} written reviews, ${s.teacherCount} teachers.`
  )
  lines.push('Courses (id | title | price | status):')
  if (!ctx.courses.length) lines.push('- none yet')
  for (const c of ctx.courses.slice(0, MAX_PRELOAD_COURSES)) {
    lines.push(`- ${c.id} | ${tenantText(c.title, 70)} | ${formatPrice(c.price, c.currency)}${c.status === 'draft' ? ' | DRAFT' : ''}`)
  }
  if (ctx.courses.length > MAX_PRELOAD_COURSES) lines.push(`- …${ctx.courses.length - MAX_PRELOAD_COURSES} more (list_courses)`)
  lines.push('Products (id | name | price | course ids):')
  if (!ctx.products.length) lines.push('- none')
  for (const p of ctx.products.slice(0, 15)) {
    lines.push(`- ${p.id} | ${tenantText(p.name, 60)} | ${formatPrice(p.price, p.currency)} | ${p.courseIds.join(',') || '-'}`)
  }
  lines.push('Plans (id | name | price/interval):')
  if (!ctx.plans.length) lines.push('- none')
  for (const p of ctx.plans.slice(0, 10)) {
    lines.push(`- ${p.id} | ${tenantText(p.name, 50)} | ${formatPrice(p.price, p.currency)}${p.interval ? `/${p.interval}` : ''}`)
  }

  const open = '<tenant_data>'
  const close = '</tenant_data>'
  const budget = maxChars - open.length - close.length - 2
  let body = ''
  for (const line of lines) {
    if (body.length + line.length + 1 > budget - 40) {
      body += '… (truncated: use the data tools)\n'
      break
    }
    body += `${line}\n`
  }
  return `${open}\n${body}${close}`
}
