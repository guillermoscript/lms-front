// Server-side resolution of live data for dynamic Puck components.
// The result is passed to <Puck> / <Render> via `metadata` so components like
// CourseGrid render the school's real catalog instead of placeholders. Resolved
// on the server (admin client) so it works for anonymous visitors on published
// public pages and is server-rendered (no client fetch, no anon-RLS gap).
import { createAdminClient } from '@/lib/supabase/admin'
import type { LandingCourse } from '../types'

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
