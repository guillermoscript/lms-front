'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email/send'
import { createAdminClient } from '@/lib/supabase/admin'
import { countTenantUsage, getTenantPlanLimits } from '@/lib/billing/plan-limits'
import { courseLimitMessage, isPlanLimitError } from '@/lib/billing/plan-limit-error'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track, safeAnalytics } from '@/lib/analytics/server'
import { evaluateSchoolActivation } from '@/lib/analytics/activation'

export interface CourseFormData {
  title: string
  description?: string | null
  thumbnail_url?: string | null
  category_id?: number | null
  status?: 'draft' | 'published' | 'archived'
  learning_objectives?: string[] | null
  estimated_duration_minutes?: number | null
}

const MAX_OBJECTIVES = 20
const MAX_OBJECTIVE_LENGTH = 300
const MAX_DURATION_MINUTES = 60000

// Writes go through the admin client (service role), so sanitize here rather
// than relying on RLS/constraints alone.
function sanitizeObjectives(input: string[] | null | undefined): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((objective): objective is string => typeof objective === 'string')
    .map((objective) => objective.trim().slice(0, MAX_OBJECTIVE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_OBJECTIVES)
}

function sanitizeDuration(minutes: number | null | undefined): number | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null
  const rounded = Math.round(minutes)
  return rounded > 0 ? Math.min(rounded, MAX_DURATION_MINUTES) : null
}

/**
 * Check if tenant has reached their course creation limit
 */
export async function checkCourseLimit(): Promise<{
  canCreate: boolean
  currentCount: number
  limit: number
  plan: string
  approaching?: boolean
  nextPlan?: string
  nextPlanPrice?: number
}> {
  const tenantId = await getCurrentTenantId()

  // Issue #546 §5: creation enforcement used to count ALL courses (archived
  // included) against a limit resolved through a hardcoded fallback map, while
  // the downgrade pre-flight, the access-cutoff reconciler and the number shown
  // on the billing page all counted non-archived courses from
  // `platform_plans.limits`. A school could be approved for a downgrade and
  // then be unable to create a single course on the plan it just moved to,
  // with an error telling it to archive courses that provably did not help.
  //
  // Both the count and the limit now come from lib/billing/plan-limits, on the
  // service-role client so the number does not depend on what the calling
  // teacher can see through RLS.
  const adminClient = createAdminClient()
  const [{ planSlug: plan, limits }, usage] = await Promise.all([
    getTenantPlanLimits(adminClient, tenantId),
    countTenantUsage(adminClient, tenantId),
  ])

  const limit = limits?.max_courses ?? -1
  const currentCount = usage.courses
  // -1 means unlimited
  const canCreate = limit === -1 || currentCount < limit
  const approaching = limit !== -1 && currentCount >= limit * 0.8

  // Get next plan info when approaching limit
  let nextPlan: string | undefined
  let nextPlanPrice: number | undefined
  if (approaching) {
    const planOrder = ['free', 'starter', 'pro', 'business', 'enterprise']
    const currentIndex = planOrder.indexOf(plan)
    if (currentIndex >= 0 && currentIndex < planOrder.length - 1) {
      nextPlan = planOrder[currentIndex + 1]
      const prices: Record<string, number> = { starter: 9, pro: 29, business: 79, enterprise: 199 }
      nextPlanPrice = prices[nextPlan]
    }
  }

  return {
    canCreate,
    currentCount,
    limit,
    plan,
    approaching,
    nextPlan,
    nextPlanPrice,
  }
}

/**
 * Create a new course with plan limit validation
 */
export async function createCourse(courseData: CourseFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()

  if (!user) {
    throw new Error('Not authenticated')
  }

  if (role !== 'teacher' && role !== 'admin') {
    throw new Error('Unauthorized: Only teachers and admins can create courses')
  }

  // Check plan limits
  const limitCheck = await checkCourseLimit()
  if (!limitCheck.canCreate) {
    throw new Error(courseLimitMessage(limitCheck))
  }

  // Use admin client for insert — auth and role are already validated above.
  // The user's JWT may have stale tenant_role claims that don't match the
  // RLS policy on courses (requires tenant_role = teacher|admin in JWT).
  const adminClient = createAdminClient()

  // Ensure profile exists (FK courses_author_profile_fkey requires it).
  // The on_auth_user_created trigger should create profiles, but as a safety
  // net for accounts created before the trigger was added, upsert here.
  await adminClient
    .from('profiles')
    .upsert(
      { id: user.id, full_name: user.user_metadata?.full_name || null },
      { onConflict: 'id', ignoreDuplicates: true }
    )

  const { data: course, error } = await adminClient
    .from('courses')
    .insert({
      title: courseData.title,
      description: courseData.description || null,
      thumbnail_url: courseData.thumbnail_url || null,
      category_id: courseData.category_id || null,
      author_id: user.id,
      tenant_id: tenantId,
      status: courseData.status || 'draft',
      learning_objectives: sanitizeObjectives(courseData.learning_objectives),
      estimated_duration_minutes: sanitizeDuration(courseData.estimated_duration_minutes),
    })
    .select('course_id')
    .single()

  if (error) {
    // The `enforce_course_plan_limit` trigger (#658) is the authoritative check;
    // the pre-check above can lose a race to a concurrent insert or an MCP
    // write, and this is the message it would have shown.
    if (isPlanLimitError(error)) {
      throw new Error(courseLimitMessage(await checkCourseLimit()))
    }
    console.error('Failed to create course:', error)
    throw new Error(`Failed to create course: ${error.message}`)
  }

  // The course row now exists, so the tenant's course count has changed —
  // reconcile the access cutoff at the moment usage moves rather than waiting up
  // to 24h for the nightly sweep (issue #513). `checkCourseLimit` above blocks at
  // `currentCount < limit` and counts *all* courses, while
  // `computePlanLimitViolations` flags at `>` and counts only non-archived ones,
  // so a legitimate creation normally produces no violation; this call exists to
  // catch the cases where those two independent limit computations drift, and to
  // clear a stale cutoff once a tenant drops back under its limit.
  // Non-blocking, via the shared wrapper: reconciliation must never fail a course
  // that was already created, and `archiveCourse`/`deleteCourse` below reconcile
  // the same way.
  await reconcileAccessCutoffSafely(adminClient, tenantId)

  await track(
    ANALYTICS_EVENTS.COURSE_CREATED,
    {
      course_id: course.course_id,
      via: 'manual',
      status: courseData.status || 'draft',
    },
    { userId: user.id, tenantId, role }
  )

  // A course created straight into `published` is the one case where creation
  // can complete the activation condition on its own.
  if ((courseData.status || 'draft') === 'published') {
    await track(
      ANALYTICS_EVENTS.COURSE_PUBLISHED,
      { course_id: course.course_id, lesson_count: 0, days_since_course_created: 0 },
      { userId: user.id, tenantId, role }
    )
    await evaluateSchoolActivation({ tenantId, userId: user.id, role })
  }

  revalidatePath('/dashboard/teacher/courses')
  return course
}

/**
 * Update an existing course
 */
export async function updateCourse(courseId: number, courseData: CourseFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()

  if (!user) {
    throw new Error('Not authenticated')
  }

  if (role !== 'teacher' && role !== 'admin') {
    throw new Error('Unauthorized: Only teachers and admins can update courses')
  }

  // Verify course belongs to user or user is admin. `status` and `created_at`
  // ride along for the `course_published` transition check below — this select
  // already happens, so detecting the transition costs no extra round trip.
  const { data: existingCourse } = await supabase
    .from('courses')
    .select('author_id, tenant_id, status, created_at')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .single()

  if (!existingCourse) {
    throw new Error('Course not found')
  }

  if (role !== 'admin' && existingCourse.author_id !== user.id) {
    throw new Error('Unauthorized: You can only update your own courses')
  }

  // Use admin client — auth and ownership validated above, JWT tenant_role may be stale
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('courses')
    .update({
      title: courseData.title,
      description: courseData.description || null,
      thumbnail_url: courseData.thumbnail_url || null,
      category_id: courseData.category_id || null,
      status: courseData.status || undefined,
      learning_objectives: sanitizeObjectives(courseData.learning_objectives),
      estimated_duration_minutes: sanitizeDuration(courseData.estimated_duration_minutes),
    })
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Failed to update course:', error)
    throw new Error(`Failed to update course: ${error.message}`)
  }

  // TRANSITION DETECTION, not "did this save write `status`". `updateCourse` is
  // a generic save that happens to carry `status`, so firing on every call would
  // emit `course_published` each time an already-live course is edited —
  // inflating the one metric Loop B exists to produce. Only not-published →
  // published counts, and `status: undefined` above means the field was left
  // alone, which is never a publish.
  const nextStatus = courseData.status
  if (nextStatus === 'published' && existingCourse.status !== 'published') {
    // Wrapped: the `lessons` count exists only to populate `lesson_count`, and
    // the course is already published by now — an analytics read must not throw
    // "Failed to update course" at a save that succeeded.
    await safeAnalytics(async () => {
      const { count: lessonCount } = await adminClient
        .from('lessons')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', courseId)
        .eq('tenant_id', tenantId)

      const createdAt = existingCourse.created_at
        ? new Date(existingCourse.created_at)
        : null

      await track(
        ANALYTICS_EVENTS.COURSE_PUBLISHED,
        {
          course_id: courseId,
          lesson_count: lessonCount ?? 0,
          days_since_course_created:
            createdAt && !Number.isNaN(createdAt.getTime())
              ? Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000))
              : null,
          previous_status: existingCourse.status,
        },
        { userId: user.id, tenantId, role }
      )

      // Publishing is one of the two events that can complete activation.
      await evaluateSchoolActivation({ tenantId, userId: user.id, role })
    }, 'course_published')
  }

  revalidatePath('/dashboard/teacher/courses')
  revalidatePath(`/dashboard/teacher/courses/${courseId}`)
  return { success: true }
}

/**
 * Check enrollment count before deleting a course.
 * Returns { enrollmentCount, canDelete } for the UI to decide.
 */
export async function getCourseEnrollmentCount(courseId: number) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  const { count } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  return { enrollmentCount: count ?? 0 }
}

/**
 * Archive a course (safe alternative to delete — enrolled students keep access).
 */
export async function archiveCourse(courseId: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()

  if (!user) throw new Error('Not authenticated')
  if (role !== 'teacher' && role !== 'admin') throw new Error('Unauthorized')

  const { data: existingCourse } = await supabase
    .from('courses')
    .select('author_id')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .single()

  if (!existingCourse) throw new Error('Course not found')
  if (role !== 'admin' && existingCourse.author_id !== user.id) throw new Error('Unauthorized')

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('courses')
    .update({ status: 'archived' })
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error('Failed to archive course')

  // Archiving is the remediation the cutoff email asks for by name ("N active
  // courses exceed the X plan's limit of M"), and `countTenantUsage` excludes
  // archived courses — so this is the moment the school may have come back
  // under its limit. Reconciling here is what makes compliance take effect
  // immediately instead of at the next daily sweep, or never (#550, #513).
  await reconcileAccessCutoffSafely(adminClient, tenantId)

  revalidatePath('/dashboard/teacher/courses')
  revalidatePath(`/dashboard/teacher/courses/${courseId}`)
  return { success: true }
}

/**
 * Delete a course. Sends email to enrolled students if any.
 * Requires explicit confirmation — use getCourseEnrollmentCount first to warn the UI.
 */
export async function deleteCourse(courseId: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()

  if (!user) throw new Error('Not authenticated')
  if (role !== 'teacher' && role !== 'admin') throw new Error('Unauthorized')

  // Verify ownership
  const { data: course } = await supabase
    .from('courses')
    .select('course_id, author_id, title, tenant_id')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) throw new Error('Course not found')
  if (role !== 'admin' && course.author_id !== user.id) throw new Error('Unauthorized')

  const adminClient = createAdminClient()

  // Notify enrolled students before deleting
  try {
    const { data: enrollments } = await adminClient
      .from('enrollments')
      .select('user_id')
      .eq('course_id', courseId)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')

    const { data: tenantRow } = await adminClient
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'

    for (const enrollment of enrollments || []) {
      const { data: authUser } = await adminClient.auth.admin.getUserById(enrollment.user_id)
      if (authUser?.user?.email) {
        await sendEmail({
          to: authUser.user.email,
          subject: `Course "${course.title}" has been removed — ${tenantRow?.name || 'LMS Platform'}`,
          html: `<p>Hi,</p><p>The course <strong>${course.title}</strong> that you were enrolled in has been removed from ${tenantRow?.name || 'the platform'}. We're sorry for any inconvenience.</p><p><a href="${appUrl}/dashboard/student/browse">Browse other courses</a></p>`,
        })
      }
    }
  } catch (emailErr) {
    console.error('Failed to notify students of course deletion:', emailErr)
  }

  // Delete the course (cascade will handle lessons, exams, etc.)
  // adminClient already created above for email notifications
  const { error } = await adminClient
    .from('courses')
    .delete()
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Failed to delete course:', error)
    throw new Error('Failed to delete course')
  }

  // Same reason as `archiveCourse` above — deletion drops the course count too.
  await reconcileAccessCutoffSafely(adminClient, tenantId)

  revalidatePath('/dashboard/teacher/courses')
  return { success: true }
}
