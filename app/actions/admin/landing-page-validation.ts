/**
 * The save-path security boundary for landing pages (Page Architect critique C1).
 *
 * AI ops are applied in the browser and persisted by the editor's Save, so a crafted client
 * (or a human pasting `javascript:`) would bypass any check that lives only in the chat route.
 * Every write of `puck_data` therefore runs through `validateLandingPuckData`:
 *   1. core `validatePage`, LENIENT (critique C2): structure, unique ids, known block types,
 *      size caps and URL schemes. Unknown/legacy props are ignored so old pages stay saveable.
 *   2. Ref ids: a `courseId`/`productIds`/`planIds`… value that belongs to ANOTHER school is
 *      rejected. An id that matches no row at all passes (a deleted course on a legacy page
 *      renders nothing, because every render filters by tenant).
 *
 * Plain server module (not `'use server'`): it takes the admin client as an argument so the
 * actions and the unit tests share it.
 */
import { allItems, normalizeRefIds, pageCatalog, refKindOf, type PageData, type RefIdSets, type RefKind } from '@lms/core'

/** The slice of the Supabase admin client this module uses. */
export interface RefLookupClient {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: number[]): PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }>
    }
  }
}

const REF_TABLES: Record<RefKind, { table: string; idColumn: string }> = {
  course: { table: 'courses', idColumn: 'course_id' },
  product: { table: 'products', idColumn: 'product_id' },
  plan: { table: 'plans', idColumn: 'plan_id' },
}

const INTEGER_ID = /^\d{1,15}$/

export type LandingValidationResult = { ok: true } | { ok: false; errors: string[] }

/** Every ref id the page binds, per kind, in core's `normalizeRefIds` form. */
export function collectRefIds(page: PageData): Record<RefKind, Set<string>> {
  const out: Record<RefKind, Set<string>> = { course: new Set(), product: new Set(), plan: new Set() }
  for (const { item } of allItems(page)) {
    if (!item || typeof item.type !== 'string' || !item.props) continue
    for (const { key, ref } of pageCatalog.refFields(item.type)) {
      for (const id of normalizeRefIds(item.props[key])) out[refKindOf(ref)].add(id)
    }
  }
  return out
}

/**
 * Ids (of `ids`) that exist and belong to a different tenant. This is the documented
 * admin-client ownership check (select `tenant_id` by id, compare): it must see foreign rows
 * to tell "another school's course" from "a course that no longer exists".
 */
async function foreignIds(
  admin: RefLookupClient,
  tenantId: string,
  kind: RefKind,
  ids: Set<string>
): Promise<Set<string>> {
  const numeric = [...ids].filter((id) => INTEGER_ID.test(id)).map(Number)
  if (numeric.length === 0) return new Set()
  const { table, idColumn } = REF_TABLES[kind]
  const { data, error } = await admin.from(table).select(`${idColumn}, tenant_id`).in(idColumn, numeric)
  if (error) throw new Error(`Could not verify the page's ${kind} references`)
  const foreign = new Set<string>()
  for (const row of data ?? []) {
    if (row.tenant_id !== tenantId) foreign.add(String(row[idColumn]))
  }
  return foreign
}

/**
 * Validate `data` for a save by `tenantId`. Errors block the save; they are short and safe to
 * show to the admin (no row data from other tenants, only the offending id).
 */
export async function validateLandingPuckData(
  /** The Supabase admin client (typed loosely: its generated types are too deep to compare). */
  adminClient: unknown,
  tenantId: string,
  data: unknown
): Promise<LandingValidationResult> {
  const admin = adminClient as RefLookupClient
  const structural = pageCatalog.validatePage(data)
  if (!structural.ok) return { ok: false, errors: structural.errors }

  const page = data as PageData
  const collected = collectRefIds(page)
  const refs: RefIdSets = {}
  for (const kind of Object.keys(REF_TABLES) as RefKind[]) {
    const ids = collected[kind]
    if (ids.size === 0) continue
    const foreign = await foreignIds(admin, tenantId, kind, ids)
    // Allowed = everything referenced that is a well-formed id and not someone else's.
    // A malformed id ("abc") is left out, so validatePage reports it.
    refs[kind] = [...ids].filter((id) => INTEGER_ID.test(id) && !foreign.has(String(Number(id))))
  }

  const withRefs = pageCatalog.validatePage(data, { refs })
  return withRefs.ok ? { ok: true } : { ok: false, errors: withRefs.errors }
}

/** One readable line for a toast; the full list goes in `details`. */
export function summarizeValidationErrors(errors: string[]): string {
  const first = errors[0] ?? 'invalid page'
  const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : ''
  return `This page can't be saved: ${first}${more}`
}
