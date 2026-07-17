import type { DbClient, DbResult } from '../client'
import type { EnrolledCourse } from '../types'

export interface PublishedCourse {
  course_id: number
  title: string
  description: string | null
  thumbnail_url: string | null
  tags: string[] | null
  category_id: number | null
}

export interface CourseCategory {
  id: number
  name: string
}

export interface CourseForList {
  course_id: number
  title: string
  description: string | null
  thumbnail_url: string | null
  status: string
}

export interface EnrollmentRow {
  enrollment_id: number
  course_id: number
  enrollment_date: string
  status: string
}

export interface ActiveSubscription {
  subscription_id: number
  subscription_status: string
  end_date: string
  plan: {
    plan_id: number
    plan_name: string
    price: number
  } | null
}

/**
 * Published courses visible in the catalog. Caller sanitizes `search` before passing
 * (strip %, _, \\ to prevent ilike injection).
 */
export function getPublishedCourses(
  supabase: DbClient,
  tenantId: string,
  opts?: { search?: string; categoryId?: number }
): DbResult<PublishedCourse[]> {
  let query = supabase
    .from('courses')
    .select('course_id, title, description, thumbnail_url, tags, category_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('title', { ascending: true })

  if (opts?.search) {
    const safe = opts.search.replace(/[%_\\]/g, '')
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
    }
  }

  if (opts?.categoryId != null) {
    query = query.eq('category_id', opts.categoryId)
  }

  return query
}

export function getCourseCategories(
  supabase: DbClient,
  tenantId: string
): DbResult<CourseCategory[]> {
  return supabase
    .from('course_categories')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name')
}

export function getEnrolledCourses(
  supabase: DbClient,
  userId: string,
  tenantId: string
): DbResult<EnrollmentRow[]> {
  return supabase
    .from('enrollments')
    .select('enrollment_id, course_id, enrollment_date, status')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('enrollment_date', { ascending: false })
}

/**
 * Enrolled courses with nested lessons + this user's completions, for progress %.
 * The trailing `course.lessons.lesson_completions.user_id` filter scopes the embedded
 * completions to THIS user (PostgREST embedded filter) — without it every user's
 * completions leak into the count. Returns shape = EnrolledCourse[].
 */
export function getEnrolledCoursesWithProgress(
  supabase: DbClient,
  userId: string,
  tenantId: string
): DbResult<EnrolledCourse[]> {
  return supabase
    .from('enrollments')
    .select(`
      enrollment_id,
      course:courses (
        course_id,
        title,
        description,
        thumbnail_url,
        lessons (id, title, sequence, lesson_completions (user_id))
      )
    `)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .eq('course.lessons.lesson_completions.user_id', userId)
}

export function getCoursesByIds(
  supabase: DbClient,
  courseIds: number[],
  tenantId: string
): DbResult<CourseForList[]> {
  return supabase
    .from('courses')
    .select('course_id, title, description, thumbnail_url, status')
    .in('course_id', courseIds)
    .eq('tenant_id', tenantId)
}

export function getActiveSubscriptions(
  supabase: DbClient,
  userId: string,
  tenantId: string
): DbResult<ActiveSubscription[]> {
  return supabase
    .from('subscriptions')
    .select(`
      subscription_id,
      subscription_status,
      end_date,
      plan:plans!subscriptions_plan_id_fkey (
        plan_id,
        plan_name,
        price
      )
    `)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('subscription_status', 'active')
    .gte('end_date', new Date().toISOString())
    .order('end_date', { ascending: false })
}

export function getPlanCourses(
  supabase: DbClient,
  planId: number
): DbResult<{ course_id: number }[]> {
  return supabase
    .from('plan_courses')
    .select('course_id')
    .eq('plan_id', planId)
}
