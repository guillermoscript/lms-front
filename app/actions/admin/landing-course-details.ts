'use server'

/**
 * Fetch landing-block data for ids bound in the editor AFTER the page loaded
 * (a human picks a course, or the AI binds one), so the canvas can show the
 * live block without a reload. The editor merges the result into its Puck
 * `metadata` via `useLandingMetadata()`.
 *
 * Admin-only; the tenant comes from the request context (proxy-set header),
 * never from the caller, and every resolver filters by it — an id from
 * another school simply comes back absent. Drafts are included, flagged
 * `status: 'draft'`, so the editor can say "publish this course".
 */
import { verifyAdminAccess, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { normalizeIntegerIdList } from '@/lib/puck/utils/collect-bound-ids'
import {
  MAX_DETAIL_COURSES,
  getLandingCourseDetailsByIds,
  getLandingCoursesByIds,
  getLandingProducts,
} from '@/lib/puck/utils/landing-data'
import type { LandingCourse, LandingCourseDetails, LandingProduct } from '@/lib/puck/types'

export interface LandingBindingData {
  courses: LandingCourse[]
  courseDetails: Record<string, LandingCourseDetails>
  products: LandingProduct[]
}

const MAX_IDS = 24

export async function getLandingCourseDetails(input: {
  courseIds?: unknown
  detailCourseIds?: unknown
  productIds?: unknown
}): Promise<ActionResult<LandingBindingData>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()

    // Untrusted input: normalise to integer-id strings and cap.
    const courseIds = normalizeIntegerIdList(input?.courseIds).slice(0, MAX_IDS)
    const detailIds = normalizeIntegerIdList(input?.detailCourseIds).slice(0, MAX_DETAIL_COURSES)
    const productIds = normalizeIntegerIdList(input?.productIds).slice(0, MAX_IDS)

    const [courses, courseDetails, products] = await Promise.all([
      courseIds.length ? getLandingCoursesByIds(tenantId, courseIds) : Promise.resolve([]),
      detailIds.length ? getLandingCourseDetailsByIds(tenantId, detailIds, { includeDrafts: true }) : Promise.resolve({}),
      productIds.length ? getLandingProducts(tenantId, { ids: productIds }) : Promise.resolve([]),
    ])
    return { success: true, data: { courses, courseDetails, products } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load course details'
    return { success: false, error: message.startsWith('Unauthorized') ? 'Unauthorized' : 'Failed to load course details' }
  }
}
