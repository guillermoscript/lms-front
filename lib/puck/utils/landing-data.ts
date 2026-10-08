// Server-side resolution of live data for dynamic Puck components.
// The result is passed to <Puck> / <Render> via `metadata` so components like
// CourseGrid render the school's real catalog instead of placeholders. Resolved
// on the server (admin client) so it works for anonymous visitors on published
// public pages and is server-rendered (no client fetch, no anon-RLS gap).
//
// These resolvers are THE shared course/product/plan shapers (design §4,
// correction C4): the page-builder AI data tools call them too, so the AI binds
// exactly what the public render can show. Every query carries an explicit
// `.eq('tenant_id', tenantId)` (or is keyed by ids that were tenant-filtered one
// step earlier, for tables with no tenant_id: reviews, profiles,
// lesson_completions), selects safe display columns only, and NEVER selects
// lesson content.
import { createAdminClient } from '@/lib/supabase/admin'
import { isFreePreviewEnabled } from '@/lib/settings/free-preview'
import { collectBoundIds } from './collect-bound-ids'
import { planCheckoutHref, productHref } from './checkout-href'
import type {
  LandingAuthor,
  LandingCourse,
  LandingCourseDetails,
  LandingData,
  LandingLesson,
  LandingPlan,
  LandingProduct,
  LandingStats,
  LandingTestimonial,
  LandingTeacher,
} from '../types'

// The typed builder fights the dynamic column lists below; rows are cast at the edge.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

/** Column lists, exported so tests (and reviewers) can see exactly what leaves the DB. */
export const COURSE_COLUMNS = 'course_id, title, description, thumbnail_url, status'
export const COURSE_DETAIL_COLUMNS = `${COURSE_COLUMNS}, learning_objectives, author_id`
export const LESSON_COLUMNS = 'id, course_id, title, sequence, is_preview, publish_at'
export const PRODUCT_COLUMNS = 'product_id, name, description, price, currency, image'
export const AUTHOR_COLUMNS = 'id, full_name, avatar_url, bio'
export const REVIEWER_COLUMNS = 'id, full_name, avatar_url'
export const REVIEW_COLUMNS = 'review_id, user_id, entity_id, rating, review_text, created_at'

/** At most this many courses get full details per page (design §4). */
export const MAX_DETAIL_COURSES = 10
/** Cap on referenced ids unioned into the base lists. */
export const MAX_REFERENCED_IDS = 48
/** Reviews kept per course in `courseDetails`. */
export const MAX_REVIEWS_PER_COURSE = 6

export interface LandingResolveOptions {
  /**
   * Include draft courses, flagged `status: 'draft'`. Only the editor / AI
   * tools ask for this; a public render never does.
   */
  includeDrafts?: boolean
}

export interface GetLandingDataOptions extends LandingResolveOptions {
  /**
   * The page (or pages) being rendered. Referenced ids are resolved even when
   * they fall outside the latest-N window, and single-course bindings get
   * `courseDetails`.
   */
  puckData?: unknown
}

function courseStatuses(opts?: LandingResolveOptions): string[] {
  return opts?.includeDrafts ? ['published', 'draft'] : ['published']
}

/** A resolver that throws degrades to its empty default instead of blanking the page. */
async function settle<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise
  } catch (err) {
    console.error('[landing-data] resolver failed:', err instanceof Error ? err.message : err)
    return fallback
  }
}

function toNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toIntegerIds(ids: string[]): number[] {
  const out: number[] = []
  for (const id of ids) {
    const n = Number(id)
    if (typeof id === 'string' && id.trim() !== '' && Number.isSafeInteger(n) && n >= 0 && !out.includes(n)) out.push(n)
  }
  return out
}

function unionById<T extends { id: string }>(first: T[], second: T[]): T[] {
  const seen = new Set(first.map((x) => x.id))
  const out = [...first]
  for (const x of second) {
    if (seen.has(x.id)) continue
    seen.add(x.id)
    out.push(x)
  }
  return out
}

/**
 * Resolve the full live-data bundle for a tenant in one shot, for the Puck
 * `metadata`. Every dynamic landing block reads its slice from here.
 *
 * With `puckData`, ids the page references (CourseHero.courseId,
 * CourseGrid.courseIds, ProductGrid.productIds, …) are unioned in even when
 * they fall outside the latest-24 window, and `courseDetails` is filled for the
 * single-course bindings (≤10). The `courses` list itself is always
 * published-only, so catalog blocks never show a draft.
 */
export async function getLandingData(tenantId: string, opts: GetLandingDataOptions = {}): Promise<LandingData> {
  const bound = collectBoundIds(opts.puckData ?? null)
  const referencedCourses = bound.courseIds.slice(0, MAX_REFERENCED_IDS)
  const referencedProducts = bound.productIds.slice(0, MAX_REFERENCED_IDS)
  const none = <T,>(value: T) => Promise.resolve(value)

  const [latestCourses, extraCourses, plans, stats, testimonials, teachers, latestProducts, extraProducts, courseDetails] =
    await Promise.all([
      settle(getLandingCourses(tenantId), []),
      settle(referencedCourses.length ? getLandingCoursesByIds(tenantId, referencedCourses) : none([]), []),
      settle(getLandingPlans(tenantId), []),
      settle(getLandingStats(tenantId), { students: 0, courses: 0, completions: 0 }),
      settle(getLandingTestimonials(tenantId), []),
      settle(getLandingTeachers(tenantId), []),
      settle(getLandingProducts(tenantId), []),
      settle(referencedProducts.length ? getLandingProducts(tenantId, { ids: referencedProducts }) : none([]), []),
      settle<Record<string, LandingCourseDetails>>(
        bound.detailCourseIds.length
          ? getLandingCourseDetailsByIds(tenantId, bound.detailCourseIds, { includeDrafts: opts.includeDrafts })
          : none({}),
        {}
      ),
    ])

  return {
    courses: unionById(latestCourses, extraCourses),
    plans,
    stats,
    testimonials,
    teachers,
    products: unionById(latestProducts, extraProducts),
    courseDetails,
  }
}

// ─── Courses ────────────────────────────────────────────────────────────────

/**
 * Cheapest ACTIVE PAID product per course (absent = free). Matches checkout,
 * which treats a course with no paid product as free enrollment.
 * product_courses can have multiple rows per course — never .single().
 */
async function getCoursePrices(
  admin: AdminClient,
  tenantId: string,
  courseIds: number[]
): Promise<Map<number, { price: number; currency: string | null }>> {
  const priceByCourse = new Map<number, { price: number; currency: string | null }>()
  if (!courseIds.length) return priceByCourse
  const { data: links } = await admin
    .from('product_courses')
    .select('course_id, products(price, currency, status)')
    .eq('tenant_id', tenantId)
    .in('course_id', courseIds)

  for (const link of (links ?? []) as {
    course_id: number
    products: { price: unknown; currency: string | null; status: string | null } | null
  }[]) {
    const p = link.products
    const price = toNumber(p?.price)
    if (!p || p.status !== 'active' || price == null || price <= 0) continue
    const existing = priceByCourse.get(link.course_id)
    if (!existing || price < existing.price) {
      priceByCourse.set(link.course_id, { price, currency: p.currency ?? null })
    }
  }
  return priceByCourse
}

type CourseRow = {
  course_id: number
  title: string
  description: string | null
  thumbnail_url: string | null
  status: string
}

function mapCourse(c: CourseRow, priced: { price: number; currency: string | null } | undefined): LandingCourse {
  return {
    id: String(c.course_id),
    title: c.title,
    description: c.description ?? null,
    image: c.thumbnail_url ?? null,
    price: priced?.price ?? null,
    currency: priced?.currency ?? null,
    status: c.status === 'draft' ? 'draft' : 'published',
  }
}

/** The tenant's newest courses (published only unless `includeDrafts`; never deleted/archived). */
export async function getLandingCourses(
  tenantId: string,
  opts: LandingResolveOptions & { limit?: number } = {}
): Promise<LandingCourse[]> {
  const admin = createAdminClient() as AdminClient
  const { data: courses } = await admin
    .from('courses')
    .select(COURSE_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('status', courseStatuses(opts))
    .is('deleted_at', null)
    .order('course_id', { ascending: false })
    .limit(opts.limit ?? 24)

  const rows = (courses ?? []) as CourseRow[]
  if (!rows.length) return []
  const prices = await getCoursePrices(admin, tenantId, rows.map((c) => c.course_id))
  return rows.map((c) => mapCourse(c, prices.get(c.course_id)))
}

/** Specific courses by id, tenant-scoped (props hold strings; the DB key is an integer). */
export async function getLandingCoursesByIds(
  tenantId: string,
  ids: string[],
  opts: LandingResolveOptions = {}
): Promise<LandingCourse[]> {
  const numeric = toIntegerIds(ids).slice(0, MAX_REFERENCED_IDS)
  if (!numeric.length) return []
  const admin = createAdminClient() as AdminClient
  const { data: courses } = await admin
    .from('courses')
    .select(COURSE_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('status', courseStatuses(opts))
    .is('deleted_at', null)
    .in('course_id', numeric)

  const rows = (courses ?? []) as CourseRow[]
  if (!rows.length) return []
  const prices = await getCoursePrices(admin, tenantId, rows.map((c) => c.course_id))
  return rows.map((c) => mapCourse(c, prices.get(c.course_id)))
}

/** A lesson is public once published and its schedule (if any) has passed. */
export function isLessonLive(publishAt: string | null | undefined, now: number): boolean {
  if (!publishAt) return true
  const t = Date.parse(publishAt)
  return Number.isNaN(t) || t <= now
}

type DetailCourseRow = CourseRow & { learning_objectives: string[] | null; author_id: string | null }
type LessonRow = {
  id: number
  course_id: number
  title: string | null
  sequence: number | null
  is_preview: boolean | null
  publish_at: string | null
}
type ReviewRow = {
  review_id: number
  user_id: string
  entity_id: number
  rating: number | null
  review_text: string | null
  created_at: string | null
}
type ProfileRow = { id: string; full_name: string | null; avatar_url: string | null; bio?: string | null }

/**
 * Full details for the courses a page binds (≤10): base fields + objectives,
 * published lesson TITLES (never content), author, rating and recent reviews.
 * Ids that are not this tenant's, deleted, archived (or draft without
 * `includeDrafts`) are simply absent from the result.
 */
export async function getLandingCourseDetailsByIds(
  tenantId: string,
  ids: string[],
  opts: LandingResolveOptions = {}
): Promise<Record<string, LandingCourseDetails>> {
  const numeric = toIntegerIds(ids).slice(0, MAX_DETAIL_COURSES)
  if (!numeric.length) return {}
  const admin = createAdminClient() as AdminClient

  const { data: courseRows } = await admin
    .from('courses')
    .select(COURSE_DETAIL_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('status', courseStatuses(opts))
    .is('deleted_at', null)
    .in('course_id', numeric)

  const courses = (courseRows ?? []) as DetailCourseRow[]
  if (!courses.length) return {}
  // Only ids that survived the tenant filter go into the follow-up queries.
  const courseIds = courses.map((c) => c.course_id)
  const authorIds = [...new Set(courses.map((c) => c.author_id).filter((id): id is string => !!id))]

  const [prices, lessonsRes, reviewsRes, authorsRes, previewEnabled] = await Promise.all([
    getCoursePrices(admin, tenantId, courseIds),
    admin
      .from('lessons')
      .select(LESSON_COLUMNS)
      .eq('tenant_id', tenantId)
      .in('course_id', courseIds)
      .eq('status', 'published')
      .order('sequence', { ascending: true })
      .limit(2000),
    // reviews has no tenant_id: scoped by the tenant-filtered course ids above.
    admin
      .from('reviews')
      .select(REVIEW_COLUMNS)
      .eq('entity_type', 'courses')
      .in('entity_id', courseIds)
      .order('created_at', { ascending: false })
      .limit(1000),
    authorIds.length
      ? admin.from('profiles').select(AUTHOR_COLUMNS).in('id', authorIds)
      : Promise.resolve({ data: [] }),
    settle(isFreePreviewEnabled(tenantId), false),
  ])

  const now = Date.now()
  const lessonsByCourse = new Map<number, LandingLesson[]>()
  for (const l of (lessonsRes?.data ?? []) as LessonRow[]) {
    if (!isLessonLive(l.publish_at, now)) continue
    const list = lessonsByCourse.get(l.course_id) ?? []
    list.push({ id: String(l.id), title: l.title ?? '', sequence: l.sequence ?? null, isPreview: !!l.is_preview })
    lessonsByCourse.set(l.course_id, list)
  }

  const ratingsByCourse = new Map<number, number[]>()
  const textByCourse = new Map<number, ReviewRow[]>()
  for (const r of (reviewsRes?.data ?? []) as ReviewRow[]) {
    if (typeof r.rating === 'number') {
      const list = ratingsByCourse.get(r.entity_id) ?? []
      list.push(r.rating)
      ratingsByCourse.set(r.entity_id, list)
    }
    if (r.review_text && r.review_text.trim()) {
      const list = textByCourse.get(r.entity_id) ?? []
      if (list.length < MAX_REVIEWS_PER_COURSE) list.push(r)
      textByCourse.set(r.entity_id, list)
    }
  }

  const reviewerIds = [...new Set([...textByCourse.values()].flat().map((r) => r.user_id))]
  const { data: reviewers } = reviewerIds.length
    ? await admin.from('profiles').select(REVIEWER_COLUMNS).in('id', reviewerIds)
    : { data: [] }
  const reviewerById = new Map(((reviewers ?? []) as ProfileRow[]).map((p) => [p.id, p]))
  const authorById = new Map(((authorsRes?.data ?? []) as ProfileRow[]).map((p) => [p.id, p]))

  const out: Record<string, LandingCourseDetails> = {}
  for (const c of courses) {
    const base = mapCourse(c, prices.get(c.course_id))
    const lessons = lessonsByCourse.get(c.course_id) ?? []
    const ratings = ratingsByCourse.get(c.course_id) ?? []
    const authorRow = c.author_id ? authorById.get(c.author_id) : undefined
    const author: LandingAuthor | null = authorRow
      ? {
          id: authorRow.id,
          name: authorRow.full_name?.trim() || null,
          avatar: authorRow.avatar_url ?? null,
          bio: authorRow.bio?.trim() || null,
        }
      : null
    out[base.id] = {
      ...base,
      objectives: (c.learning_objectives ?? []).filter((o) => typeof o === 'string' && o.trim().length > 0),
      lessons,
      lessonCount: lessons.length,
      author,
      rating: {
        avg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        count: ratings.length,
      },
      reviews: (textByCourse.get(c.course_id) ?? []).map((r) => {
        const profile = reviewerById.get(r.user_id)
        return {
          id: String(r.review_id),
          // No English placeholder here: the block shows a translated fallback.
          name: profile?.full_name?.trim() || '',
          avatar: profile?.avatar_url ?? null,
          rating: r.rating ?? null,
          quote: r.review_text ?? '',
          courseTitle: c.title,
        }
      }),
      previewEnabled,
    }
  }
  return out
}

// ─── Products ───────────────────────────────────────────────────────────────

/**
 * Active products for ProductGrid / CoursePricingCard. `ids` → exactly those
 * (tenant-scoped); otherwise the newest `limit`. `products` RLS is permissive
 * for anon, so the explicit tenant filter here is load-bearing.
 */
export async function getLandingProducts(
  tenantId: string,
  opts: { ids?: string[]; limit?: number } = {}
): Promise<LandingProduct[]> {
  const admin = createAdminClient() as AdminClient
  let query = admin.from('products').select(PRODUCT_COLUMNS).eq('tenant_id', tenantId).eq('status', 'active')
  if (opts.ids) {
    const numeric = toIntegerIds(opts.ids).slice(0, MAX_REFERENCED_IDS)
    if (!numeric.length) return []
    query = query.in('product_id', numeric)
  } else {
    query = query.order('created_at', { ascending: false }).limit(opts.limit ?? 24)
  }
  const { data: rows } = await query
  const products = (rows ?? []) as {
    product_id: number
    name: string
    description: string | null
    price: unknown
    currency: string | null
    image: string | null
  }[]
  if (!products.length) return []

  const { data: links } = await admin
    .from('product_courses')
    .select('product_id, course_id')
    .eq('tenant_id', tenantId)
    .in(
      'product_id',
      products.map((p) => p.product_id)
    )
  const coursesByProduct = new Map<number, string[]>()
  for (const l of (links ?? []) as { product_id: number; course_id: number }[]) {
    const list = coursesByProduct.get(l.product_id) ?? []
    list.push(String(l.course_id))
    coursesByProduct.set(l.product_id, list)
  }

  return products.map((p) => {
    const courseIds = coursesByProduct.get(p.product_id) ?? []
    const price = toNumber(p.price)
    const id = String(p.product_id)
    return {
      id,
      name: p.name,
      description: p.description ?? null,
      image: p.image ?? null,
      price,
      currency: p.currency ?? null,
      courseIds,
      href: productHref({ id, courseIds, price }),
    }
  })
}

// ─── Plans ──────────────────────────────────────────────────────────────────

// Plan `duration_in_days` is a raw day count (no month/year enum) — map the
// common cadences to a label, else fall back to a "N days" string.
function intervalFromDays(days: number | null | undefined): string | null {
  if (days == null) return null
  if (days <= 1) return 'day'
  if (days >= 6 && days <= 8) return 'week'
  if (days >= 28 && days <= 31) return 'month'
  if (days >= 88 && days <= 93) return 'quarter'
  if (days >= 360 && days <= 366) return 'year'
  return `${days} days`
}

// `plans.features` is a single free-form string, not a JSON array. Split on
// newlines (then commas as a fallback) so PricingTable gets a clean bullet list.
function parseFeatures(features: string | null | undefined): string[] {
  if (!features) return []
  const parts = features.includes('\n') ? features.split('\n') : features.split(',')
  return parts.map((f) => f.trim()).filter(Boolean)
}

/** Tenant subscription plans for PricingTable. */
export async function getLandingPlans(tenantId: string): Promise<LandingPlan[]> {
  const admin = createAdminClient() as AdminClient
  const { data } = await admin
    .from('plans')
    .select('plan_id, plan_name, price, currency, duration_in_days, features, description')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('price', { ascending: true })

  const plans = (data ?? []) as {
    plan_id: number
    plan_name: string | null
    price: unknown
    currency: string | null
    duration_in_days: number | null
    features: string | null
    description: string | null
  }[]
  // Highlight the middle tier when there are three or more (common pricing UX).
  const highlightIdx = plans.length >= 3 ? 1 : -1
  return plans.map((p, i) => ({
    id: String(p.plan_id),
    name: p.plan_name ?? 'Plan',
    price: toNumber(p.price),
    currency: p.currency ?? null,
    interval: intervalFromDays(p.duration_in_days),
    features: parseFeatures(p.features),
    description: p.description?.trim() || null,
    href: planCheckoutHref(String(p.plan_id)),
    highlighted: i === highlightIdx,
  }))
}

// ─── Stats / testimonials / teachers ────────────────────────────────────────

// Published, non-deleted courses for the tenant → { course_id → title }.
// Shared by the stats and testimonial resolvers (both need the tenant's course set).
async function getPublishedCourseIndex(admin: AdminClient, tenantId: string): Promise<Map<number, string>> {
  const { data } = await admin
    .from('courses')
    .select('course_id, title')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .is('deleted_at', null)
  const index = new Map<number, string>()
  for (const c of (data ?? []) as { course_id: number; title: string }[]) index.set(c.course_id, c.title)
  return index
}

/** Aggregate counts (students / courses / lessons completed) for StatsBand etc. */
export async function getLandingStats(tenantId: string): Promise<LandingStats> {
  const admin = createAdminClient() as AdminClient
  const index = await getPublishedCourseIndex(admin, tenantId)
  const courseIds = [...index.keys()]

  const { count: students } = await admin
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  // lesson_completions has no tenant_id/course_id — scope via the tenant's lessons.
  let completions = 0
  if (courseIds.length) {
    const { data: lessons } = await admin
      .from('lessons')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('course_id', courseIds)
      .limit(2000)
    const lessonIds = ((lessons ?? []) as { id: number }[]).map((l) => l.id)
    if (lessonIds.length) {
      const { count } = await admin
        .from('lesson_completions')
        .select('*', { count: 'exact', head: true })
        .in('lesson_id', lessonIds)
      completions = count ?? 0
    }
  }

  return { students: students ?? 0, courses: index.size, completions }
}

/** Recent course reviews with text, tenant-wide (TestimonialGrid / SocialProof). */
export async function getLandingTestimonials(tenantId: string): Promise<LandingTestimonial[]> {
  const admin = createAdminClient() as AdminClient
  const index = await getPublishedCourseIndex(admin, tenantId)
  const courseIds = [...index.keys()]
  if (!courseIds.length) return []

  // reviews has no tenant_id: scoped by the tenant's published course ids.
  const { data: reviews } = await admin
    .from('reviews')
    .select(REVIEW_COLUMNS)
    .eq('entity_type', 'courses')
    .in('entity_id', courseIds)
    .not('review_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(12)

  const rows = (reviews ?? []) as ReviewRow[]
  if (!rows.length) return []

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles } = await admin.from('profiles').select(REVIEWER_COLUMNS).in('id', userIds)
  const profileById = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]))

  return rows.map((r) => {
    const profile = profileById.get(r.user_id)
    return {
      id: String(r.review_id),
      name: profile?.full_name?.trim() || '',
      avatar: profile?.avatar_url ?? null,
      rating: r.rating ?? null,
      quote: r.review_text ?? '',
      courseTitle: index.get(r.entity_id) ?? null,
    }
  })
}

/** Tenant instructors for TeamGrid / InstructorCard. */
export async function getLandingTeachers(tenantId: string): Promise<LandingTeacher[]> {
  const admin = createAdminClient() as AdminClient
  const { data: members } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'teacher')
    .eq('status', 'active')

  const userIds = [...new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id))]
  if (!userIds.length) return []

  const { data: profiles } = await admin.from('profiles').select(AUTHOR_COLUMNS).in('id', userIds)

  // A teacher with no name on their profile is left out: InstructorCard and TeamGrid hide
  // rather than present an English "Instructor" placeholder as a person.
  return ((profiles ?? []) as ProfileRow[])
    .filter((p) => !!p.full_name?.trim())
    .map((p) => ({
      id: p.id,
      name: p.full_name!.trim(),
      avatar: p.avatar_url ?? null,
      bio: p.bio ?? null,
    }))
}
