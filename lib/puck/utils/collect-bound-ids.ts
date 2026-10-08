/**
 * Walk a page's Puck data (top-level `content` AND every DropZone in `zones`)
 * and collect the ids its data-bound blocks reference, so the server fetches
 * details only for what the page actually shows (design §4, correction D1).
 *
 * Pure and React-free: used by `getLandingData` (server), the editor's
 * `useLandingMetadata` hook (client) and the AI tools.
 *
 * Id shapes (correction D2) — all normalised to a canonical string:
 *   - `courseId` / `productId` / `teacherUserId`: a string or a number
 *   - `courseIds` / `productIds` / `planIds`: `{ id }[]` (picker shape), or a
 *     bare `string[]` / `number[]`
 * Course, product and plan ids are integers in the database and strings in
 * props; anything that is not a non-negative integer is dropped, so a stray
 * `"abc"` never reaches a query.
 */

export interface BoundIds {
  /** Every referenced course id (singular + list props), in page order, unique. */
  courseIds: string[]
  /** Course ids bound by a SINGLE-course prop (`courseId`). These get full details. */
  detailCourseIds: string[]
  productIds: string[]
  planIds: string[]
  teacherUserIds: string[]
}

const INTEGER_ID = /^\d{1,18}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Normalise one integer-id value (string | number) → canonical string, or null. */
export function normalizeIntegerId(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!INTEGER_ID.test(trimmed)) return null
    // Strip leading zeros so "007" and 7 compare equal.
    return String(Number(trimmed))
  }
  return null
}

/** Normalise a list prop (`{id}[]`, `string[]`, `number[]`) → canonical strings. */
export function normalizeIntegerIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    const raw = entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : entry
    const id = normalizeIntegerId(raw)
    if (id) out.push(id)
  }
  return out
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return UUID.test(trimmed) ? trimmed.toLowerCase() : null
}

type PuckItem = { type?: unknown; props?: Record<string, unknown> }

function itemsOf(data: unknown): PuckItem[] {
  if (!data || typeof data !== 'object') return []
  const d = data as { content?: unknown; zones?: unknown }
  const items: PuckItem[] = []
  if (Array.isArray(d.content)) items.push(...(d.content as PuckItem[]))
  if (d.zones && typeof d.zones === 'object') {
    for (const zone of Object.values(d.zones as Record<string, unknown>)) {
      if (Array.isArray(zone)) items.push(...(zone as PuckItem[]))
    }
  }
  return items
}

/**
 * Collect bound ids from one page or several (the admin list page resolves the
 * union across every page it might open). Unknown shapes are ignored.
 */
export function collectBoundIds(data: unknown | unknown[]): BoundIds {
  const pages = Array.isArray(data) ? data : [data]
  const courseIds = new Set<string>()
  const detailCourseIds = new Set<string>()
  const productIds = new Set<string>()
  const planIds = new Set<string>()
  const teacherUserIds = new Set<string>()

  for (const page of pages) {
    for (const item of itemsOf(page)) {
      const props = item?.props
      if (!props || typeof props !== 'object') continue

      const courseId = normalizeIntegerId(props.courseId)
      if (courseId) {
        courseIds.add(courseId)
        detailCourseIds.add(courseId)
      }
      for (const id of normalizeIntegerIdList(props.courseIds)) courseIds.add(id)

      const productId = normalizeIntegerId(props.productId)
      if (productId) productIds.add(productId)
      for (const id of normalizeIntegerIdList(props.productIds)) productIds.add(id)

      for (const id of normalizeIntegerIdList(props.planIds)) planIds.add(id)

      const teacher = normalizeUuid(props.teacherUserId)
      if (teacher) teacherUserIds.add(teacher)
    }
  }

  return {
    courseIds: [...courseIds],
    detailCourseIds: [...detailCourseIds],
    productIds: [...productIds],
    planIds: [...planIds],
    teacherUserIds: [...teacherUserIds],
  }
}

/** Ids in `wanted` that are not yet in `have` (both canonical strings). */
export function missingIds(wanted: string[], have: Iterable<string>): string[] {
  const known = new Set(have)
  return wanted.filter((id) => !known.has(id))
}
