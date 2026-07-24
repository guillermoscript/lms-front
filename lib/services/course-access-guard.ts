/**
 * Course Access Guard — the one gate every student content route calls.
 *
 * Issue #509: the lesson, exercise and exam-list pages fetched course content
 * with the service-role client and checked nothing but "is someone logged in",
 * so any tenant member could read any course's content by URL, and the #494
 * access cutoff was a no-op on exactly the pages that matter. Rather than
 * repeat a `hasCourseAccess` call and a redirect in each page, routes call
 * `requireCourseAccess()` — one place to change if the denial UX changes.
 *
 * Separate module from `course-access.ts` on purpose: this one imports
 * `next/navigation`, and `course-access.ts` is also used from API routes and
 * server actions that must not pull that in.
 */

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCourseAccessState } from './course-access'

/**
 * Redirects unless the user has active access to the course.
 *
 * A tenant-cutoff refusal goes to a page that explains itself; a plain
 * missing entitlement keeps the pre-existing behaviour of bouncing to the
 * student dashboard, where the course is still buyable.
 *
 * No teacher/admin bypass: `proxy.ts` already redirects non-students out of
 * `/dashboard/student/*` entirely, so staff never reach these routes.
 */
export async function requireCourseAccess(
  supabase: SupabaseClient,
  userId: string,
  courseId: number,
): Promise<void> {
  const state = await resolveCourseAccessState(supabase, userId, courseId)
  if (state === 'granted') return

  redirect(state === 'suspended' ? '/dashboard/student/access-suspended' : '/dashboard/student')
}

/**
 * Second half of the gate for content addressed by its own id (a lesson, an
 * exercise): the row must actually belong to the course in the URL.
 *
 * Without this, `requireCourseAccess` on the route's `courseId` is bypassable
 * — these pages look the row up by `lessonId`/`exerciseId` and tenant only, so
 * a student entitled to *one* course could pair that course's id with any
 * other course's lesson id and walk straight through the gate.
 */
export function requireRowInCourse(
  rowCourseId: number | null | undefined,
  routeCourseId: number,
): void {
  if (rowCourseId !== routeCourseId) {
    redirect('/dashboard/student')
  }
}
