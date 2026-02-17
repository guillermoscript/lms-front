'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'

// Fallback plan limits (used if platform_plans table query fails)
const PLAN_LIMITS_FALLBACK: Record<string, number> = {
  free: 5,
  starter: 15,
  basic: 20,
  pro: 100,
  professional: 100,
  business: -1,
  enterprise: -1,
}

export interface CourseFormData {
  title: string
  description?: string | null
  thumbnail_url?: string | null
  category_id?: number | null
  status?: 'draft' | 'published' | 'archived'
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
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  // Get tenant's plan and limits from platform_plans
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single()

  const plan = tenant?.plan || 'free'

  // Try to get limit from platform_plans table
  let limit: number
  const { data: platformPlan } = await supabase
    .from('platform_plans')
    .select('limits')
    .eq('slug', plan)
    .eq('is_active', true)
    .single()

  if (platformPlan?.limits && typeof platformPlan.limits === 'object') {
    const limits = platformPlan.limits as { max_courses?: number }
    limit = limits.max_courses ?? PLAN_LIMITS_FALLBACK[plan] ?? 5
  } else {
    limit = PLAN_LIMITS_FALLBACK[plan] ?? 5
  }

  // Count existing courses for this tenant
  const { count } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  const currentCount = count || 0
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
    throw new Error(
      `Your ${limitCheck.plan} plan is limited to ${limitCheck.limit} courses. ` +
      `You currently have ${limitCheck.currentCount} courses. ` +
      `Please upgrade your plan to create more courses.`
    )
  }

  // Create course
  const { data: course, error } = await supabase
    .from('courses')
    .insert({
      ...courseData,
      author_id: user.id,
      tenant_id: tenantId,
      status: courseData.status || 'draft',
    })
    .select('course_id')
    .single()

  if (error) {
    console.error('Failed to create course:', error)
    throw new Error('Failed to create course')
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

  // Verify course belongs to user or user is admin
  const { data: existingCourse } = await supabase
    .from('courses')
    .select('author_id, tenant_id')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .single()

  if (!existingCourse) {
    throw new Error('Course not found')
  }

  if (role !== 'admin' && existingCourse.author_id !== user.id) {
    throw new Error('Unauthorized: You can only update your own courses')
  }

  // Update course
  const { error } = await supabase
    .from('courses')
    .update(courseData)
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Failed to update course:', error)
    throw new Error('Failed to update course')
  }

  revalidatePath('/dashboard/teacher/courses')
  revalidatePath(`/dashboard/teacher/courses/${courseId}`)
  return { success: true }
}
