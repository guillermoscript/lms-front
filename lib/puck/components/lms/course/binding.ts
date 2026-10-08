/**
 * Resolve a block's course / product binding against the Puck `metadata`.
 * Pure (no React), shared by every data-bound block.
 *
 * States:
 *  - 'unbound'  no id set                      → editor notice; public: block-specific
 *  - 'missing'  id set, not in metadata        → editor notice; public: render nothing
 *  - 'draft'    course exists but is a draft   → editor notice; public: render nothing
 *  - 'ready'    live data available
 */
import type {
  LandingCourse,
  LandingCourseDetails,
  LandingProduct,
  PuckMetadata,
} from '../../../types'
import { normalizeIntegerId } from '../../../utils/collect-bound-ids'

export type BindingState = 'unbound' | 'missing' | 'draft' | 'ready'

export interface CourseBinding {
  state: BindingState
  id: string | null
  course: LandingCourse | null
  details: LandingCourseDetails | null
}

export function resolveCourseBinding(metadata: unknown, courseId: unknown): CourseBinding {
  const id = normalizeIntegerId(courseId)
  if (!id) return { state: 'unbound', id: null, course: null, details: null }
  const meta = (metadata ?? {}) as PuckMetadata
  const details = meta.courseDetails?.[id] ?? null
  const course = details ?? (meta.courses ?? []).find((c) => c.id === id) ?? null
  if (!course) return { state: 'missing', id, course: null, details: null }
  if (course.status === 'draft') return { state: 'draft', id, course, details }
  return { state: 'ready', id, course, details }
}

export interface ProductBinding {
  state: Exclude<BindingState, 'draft'>
  id: string | null
  product: LandingProduct | null
}

export function resolveProductBinding(metadata: unknown, productId: unknown): ProductBinding {
  const id = normalizeIntegerId(productId)
  if (!id) return { state: 'unbound', id: null, product: null }
  const product = ((metadata ?? {}) as PuckMetadata).products?.find((p) => p.id === id) ?? null
  return product ? { state: 'ready', id, product } : { state: 'missing', id, product: null }
}

/** Course titles for a product's linked courses, from the published course list. */
export function includedCourses(metadata: unknown, courseIds: string[]): LandingCourse[] {
  const courses = ((metadata ?? {}) as PuckMetadata).courses ?? []
  const byId = new Map(courses.map((c) => [c.id, c]))
  return courseIds.map((id) => byId.get(id)).filter((c): c is LandingCourse => !!c && c.status !== 'draft')
}
