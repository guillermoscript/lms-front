'use server'

import { revalidatePath } from 'next/cache'
import { authenticateUser } from '@/lib/actions/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPlanFeature } from '@/lib/plans/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { hasCourseAccess } from '@/lib/services/course-access'
import {
  createGroupCore,
  joinGroupCore,
  launchGroupChallengeCore,
  leaveGroupCore,
  type GroupErrorCode,
} from '@/lib/challenges/groups'

/**
 * Friend-group actions (epic #1049, #1050). Rules live in `lib/challenges/groups.ts`;
 * these only resolve the signed-in user and school and revalidate. Failures return
 * a `code` the UI translates (`challenges.groups.errors.*`), never raw messages.
 */
export type GroupActionResult<T = undefined> = { success: true; data: T } | { success: false; code: GroupErrorCode | 'unauthenticated' }

const failure = (code: GroupErrorCode | 'unauthenticated'): { success: false; code: GroupErrorCode | 'unauthenticated' } => ({ success: false, code })
const deps = () => ({ admin: createAdminClient(), hasAiGrading: (tenantId: string) => hasPlanFeature(tenantId, 'ai_grading') })

export async function createChallengeGroup(name: string): Promise<GroupActionResult<{ id: string }>> {
  try {
    const ctx = await authenticateUser()
    const r = await createGroupCore(deps(), ctx, { name })
    if (!r.ok) return failure(r.code)
    revalidatePath('/dashboard/student/groups')
    return { success: true, data: { id: r.data.id } }
  } catch {
    return failure('unauthenticated')
  }
}

/** One-tap join from `/grupo/<token>`; idempotent. */
export async function joinChallengeGroup(token: string): Promise<GroupActionResult<{ groupId: string }>> {
  try {
    const [userId, tenantId] = await Promise.all([getCurrentUserId(), getCurrentTenantId()])
    if (!userId) return failure('unauthenticated')
    const r = await joinGroupCore(createAdminClient(), { tenantId, userId }, token)
    if (!r.ok) return failure(r.code)
    revalidatePath('/dashboard/student/groups')
    return { success: true, data: { groupId: r.data.groupId } }
  } catch {
    return failure('failed')
  }
}

export async function launchGroupChallenge(groupId: string, exerciseId: number): Promise<GroupActionResult<{ token: string }>> {
  try {
    const ctx = await authenticateUser()
    const d = deps()
    const r = await launchGroupChallengeCore(d, ctx, {
      groupId,
      exerciseId,
      canUseCourse: async (courseId) => ctx.role !== 'student' || (await hasCourseAccess(d.admin, ctx.userId, courseId)),
    })
    if (!r.ok) return failure(r.code)
    revalidatePath(`/dashboard/student/groups/${groupId}`)
    return { success: true, data: { token: r.data.token } }
  } catch {
    return failure('unauthenticated')
  }
}

export async function leaveChallengeGroup(groupId: string): Promise<GroupActionResult<{ groupId: string }>> {
  try {
    const ctx = await authenticateUser()
    const r = await leaveGroupCore(createAdminClient(), ctx, groupId)
    if (!r.ok) return failure(r.code)
    revalidatePath('/dashboard/student/groups')
    return { success: true, data: { groupId } }
  } catch {
    return failure('unauthenticated')
  }
}
