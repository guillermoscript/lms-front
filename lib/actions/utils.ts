'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import type { User } from '@supabase/supabase-js'

// Re-export ActionResult from its canonical location
export type { ActionResult } from '@/lib/supabase/admin'

/**
 * Authenticated context returned by `authenticateUser()`.
 * Every server action that mutates data should start by calling this.
 */
export interface AuthContext {
  user: User
  userId: string
  tenantId: string
  role: 'student' | 'teacher' | 'admin'
  supabase: Awaited<ReturnType<typeof createClient>>
}

/**
 * Authenticate the current user and resolve tenant context.
 *
 * Throws if no authenticated user is found — callers should wrap in
 * try/catch and return `{ success: false, error }`.
 *
 * Usage:
 * ```ts
 * const ctx = await authenticateUser()
 * ```
 */
export async function authenticateUser(): Promise<AuthContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const [tenantId, role] = await Promise.all([
    getCurrentTenantId(),
    getUserRole(),
  ])

  if (!role) {
    throw new Error('Not authenticated')
  }

  return { user, userId: user.id, tenantId, role, supabase }
}

/**
 * Authenticate and require a minimum role (teacher or admin).
 * Throws if the user lacks the required role.
 *
 * Usage:
 * ```ts
 * const ctx = await requireTeacherOrAdmin()
 * ```
 */
export async function requireTeacherOrAdmin(): Promise<AuthContext> {
  const ctx = await authenticateUser()

  if (ctx.role !== 'teacher' && ctx.role !== 'admin') {
    throw new Error('Unauthorized: Teacher or admin access required')
  }

  return ctx
}

/**
 * Authenticate and require admin role.
 * Throws if the user is not an admin.
 *
 * Usage:
 * ```ts
 * const ctx = await requireAdmin()
 * ```
 */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await authenticateUser()

  if (ctx.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required')
  }

  return ctx
}

/**
 * Verify that a course belongs to the current tenant and (optionally) to the
 * current user. Returns the course row or throws.
 *
 * - Teachers can only access their own courses.
 * - Admins can access any course in their tenant.
 */
export async function verifyCourseOwnership(
  ctx: AuthContext,
  courseId: number
): Promise<{ course_id: number; author_id: string }> {
  const { data: course } = await ctx.supabase
    .from('courses')
    .select('course_id, author_id')
    .eq('course_id', courseId)
    .eq('tenant_id', ctx.tenantId)
    .single()

  if (!course) {
    throw new Error('Course not found')
  }

  if (ctx.role !== 'admin' && course.author_id !== ctx.userId) {
    throw new Error('Unauthorized: You can only modify your own courses')
  }

  return course
}

/**
 * Wrap a server action body so errors are always returned as
 * `{ success: false, error: string }` instead of throwing.
 *
 * Usage:
 * ```ts
 * export async function myAction(id: number) {
 *   return actionHandler(async () => {
 *     const ctx = await requireTeacherOrAdmin()
 *     // ... do work ...
 *     return { someData: true }
 *   })
 * }
 * ```
 */
export async function actionHandler<T>(
  fn: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    console.error('Server action error:', err)
    return { success: false, error: message }
  }
}
