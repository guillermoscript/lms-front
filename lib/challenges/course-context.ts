import { createAdminClient } from '@/lib/supabase/admin'
import { pickCourseProduct } from '@/lib/course-pricing'

export interface ChallengeCourse {
  id: number
  title: string
  description: string | null
  thumbnailUrl: string | null
  lessonCount: number
  durationMinutes: number | null
  isFree: boolean
  price: number | null
  currency: string | null
}

/**
 * The published course the challenge exercise belongs to, for the public
 * landing (context block + upsell). Read-only: it never grants access, the CTA
 * only links to the course page, which owns enrollment and checkout. `null`
 * when the exercise is standalone or its course is not public.
 */
export async function loadChallengeCourse(tenantId: string, exerciseId: number): Promise<ChallengeCourse | null> {
  const admin = createAdminClient()
  const { data: exercise } = await admin
    .from('exercises')
    .select('course_id')
    .eq('id', exerciseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!exercise?.course_id) return null

  const [{ data: course }, { data: lessons }, { data: links }] = await Promise.all([
    admin
      .from('courses')
      .select('course_id, title, description, thumbnail_url, estimated_duration_minutes, status, deleted_at, archived_at')
      .eq('course_id', exercise.course_id)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin
      .from('lessons')
      .select('id')
      .eq('course_id', exercise.course_id)
      .eq('tenant_id', tenantId)
      .eq('status', 'published'),
    admin.from('product_courses').select('product:products(price, currency)').eq('course_id', exercise.course_id),
  ])
  if (!course || course.status !== 'published' || course.deleted_at || course.archived_at) return null

  const product = pickCourseProduct(
    (links ?? []).map((l) => (Array.isArray(l.product) ? l.product[0] : l.product) as { price: number | string; currency: string | null } | null),
  )
  const isFree = !product || Number(product.price) === 0
  return {
    id: course.course_id,
    title: course.title,
    description: course.description,
    thumbnailUrl: course.thumbnail_url,
    lessonCount: lessons?.length ?? 0,
    durationMinutes: course.estimated_duration_minutes,
    isFree,
    price: isFree || !product ? null : Number(product.price),
    currency: isFree || !product ? null : product.currency,
  }
}
