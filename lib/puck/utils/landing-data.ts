// Server-side resolution of live data for dynamic Puck components.
// The result is passed to <Puck> / <Render> via `metadata` so components like
// CourseGrid render the school's real catalog instead of placeholders. Resolved
// on the server (admin client) so it works for anonymous visitors on published
// public pages and is server-rendered (no client fetch, no anon-RLS gap).
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  LandingCourse,
  LandingPlan,
  LandingStats,
  LandingTestimonial,
  LandingTeacher,
  LandingData,
} from '../types'

/**
 * Resolve the full live-data bundle for a tenant in one shot, for the Puck
 * `metadata`. Every dynamic landing block reads its slice from here. Individual
 * resolvers are resilient — a failure in one (e.g. reviews) returns its empty
 * default rather than blanking the whole page.
 */
export async function getLandingData(tenantId: string): Promise<LandingData> {
  const [courses, plans, stats, testimonials, teachers] = await Promise.all([
    getLandingCourses(tenantId),
    getLandingPlans(tenantId),
    getLandingStats(tenantId),
    getLandingTestimonials(tenantId),
    getLandingTeachers(tenantId),
  ])
  return { courses, plans, stats, testimonials, teachers }
}

export async function getLandingCourses(
  tenantId: string,
  limit = 24
): Promise<LandingCourse[]> {
  const admin = createAdminClient()

  const { data: courses } = await admin
    .from('courses')
    .select('course_id, title, description, thumbnail_url')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('course_id', { ascending: false })
    .limit(limit)

  if (!courses?.length) return []

  // A course is priced via its linked product(s); show the cheapest active one.
  // product_courses can have multiple rows per course — never .single().
  const courseIds = courses.map((c) => c.course_id)
  const { data: links } = await admin
    .from('product_courses')
    .select('course_id, products(price, currency, status)')
    .eq('tenant_id', tenantId)
    .in('course_id', courseIds)

  const priceByCourse = new Map<number, { price: number; currency: string | null }>()
  for (const link of links ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (link as any).products
    if (!p || p.status !== 'active' || p.price == null) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cid = (link as any).course_id as number
    const existing = priceByCourse.get(cid)
    if (!existing || p.price < existing.price) {
      priceByCourse.set(cid, { price: p.price, currency: p.currency ?? null })
    }
  }

  return courses.map((c) => {
    const priced = priceByCourse.get(c.course_id)
    return {
      id: String(c.course_id),
      title: c.title,
      description: c.description ?? null,
      image: c.thumbnail_url ?? null,
      price: priced?.price ?? null,
      currency: priced?.currency ?? null,
    }
  })
}

// A course is "free" when it has no linked product priced > 0.
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

// Published, non-deleted courses for the tenant → { course_id → title }.
// Shared by the stats and testimonial resolvers (both need the tenant's course set).
async function getPublishedCourseIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string
): Promise<Map<number, string>> {
  const { data } = await admin
    .from('courses')
    .select('course_id, title')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .is('deleted_at', null)
  const index = new Map<number, string>()
  for (const c of data ?? []) index.set(c.course_id, c.title)
  return index
}

/** Tenant subscription plans for PricingTable. */
export async function getLandingPlans(tenantId: string): Promise<LandingPlan[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('plans')
    .select('plan_id, plan_name, price, currency, duration_in_days, features, description')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('price', { ascending: true })

  const plans = data ?? []
  // Highlight the middle tier when there are three or more (common pricing UX).
  const highlightIdx = plans.length >= 3 ? 1 : -1
  return plans.map((p, i) => ({
    id: String(p.plan_id),
    name: p.plan_name ?? 'Plan',
    price: p.price ?? null,
    currency: p.currency ?? null,
    interval: intervalFromDays(p.duration_in_days),
    features: parseFeatures(p.features),
    href: `/checkout?planId=${p.plan_id}`,
    highlighted: i === highlightIdx,
  }))
}

/** Aggregate counts (students / courses / lessons completed) for StatsBand etc. */
export async function getLandingStats(tenantId: string): Promise<LandingStats> {
  const admin = createAdminClient()
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
      .in('course_id', courseIds)
      .limit(2000)
    const lessonIds = (lessons ?? []).map((l: { id: number }) => l.id)
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

/** Course reviews for TestimonialGrid / SocialProof (display fields only). */
export async function getLandingTestimonials(tenantId: string): Promise<LandingTestimonial[]> {
  const admin = createAdminClient()
  const index = await getPublishedCourseIndex(admin, tenantId)
  const courseIds = [...index.keys()]
  if (!courseIds.length) return []

  const { data: reviews } = await admin
    .from('reviews')
    .select('review_id, user_id, entity_id, rating, review_text, created_at')
    .eq('entity_type', 'courses')
    .in('entity_id', courseIds)
    .not('review_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(6)

  if (!reviews?.length) return []

  const userIds = [...new Set(reviews.map((r: { user_id: string }) => r.user_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds)
  const profileById = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return reviews.map((r: any) => {
    const profile = profileById.get(r.user_id) as { full_name: string | null; avatar_url: string | null } | undefined
    return {
      id: String(r.review_id),
      name: profile?.full_name ?? 'Student',
      avatar: profile?.avatar_url ?? null,
      rating: r.rating ?? null,
      quote: r.review_text ?? '',
      courseTitle: index.get(r.entity_id) ?? null,
    }
  })
}

/** Tenant instructors for TeamGrid. */
export async function getLandingTeachers(tenantId: string): Promise<LandingTeacher[]> {
  const admin = createAdminClient()
  const { data: members } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'teacher')
    .eq('status', 'active')

  const userIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))]
  if (!userIds.length) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, bio')
    .in('id', userIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (profiles ?? []).map((p: any) => ({
    id: p.id,
    name: p.full_name ?? 'Instructor',
    avatar: p.avatar_url ?? null,
    bio: p.bio ?? null,
  }))
}
