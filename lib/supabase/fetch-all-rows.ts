/**
 * Complete, verified reads for platform-wide sweeps (issue #533).
 *
 * PostgREST caps every response at the project's configured API "Max rows"
 * (`supabase/config.toml:18` sets `max_rows = 1000` locally; the cloud project
 * carries no `pgrst.db_max_rows` role override, so it runs on Supabase's
 * hosted default of 1000). A capped response is a plain 200 with fewer rows —
 * indistinguishable from a complete one. Any caller that reads a whole
 * relation and then does arithmetic over it therefore produces a confidently
 * wrong number rather than an error: `getPayoutsOwed()` underpaid a school
 * when `transactions` truncated and overpaid it when `payouts` did, and the
 * `enforce-plan-limits` cron silently stopped visiting tenants past the cap.
 *
 * `fetchAllRows` pages until the relation is exhausted and then ASSERTS the
 * result is complete against PostgREST's own exact count, so a cap (or a
 * future change to it) surfaces as a thrown error instead of a quiet
 * shortfall. Nothing here depends on the cap's value: the page size is ours,
 * and the assertion is what actually guarantees completeness.
 */

/**
 * Rows requested per page. Deliberately below the 1000 cap so the common case
 * never brushes against it — but the loop does not rely on that: a server
 * configured lower simply hands back shorter pages, and `fetchAllRows` adopts
 * the size it actually got (see below) rather than mistaking a capped page for
 * the end of the relation. Nothing here breaks if the cap is changed.
 */
export const FETCH_ALL_PAGE_SIZE = 500

/**
 * Runaway guard — a backstop against a server that keeps returning full pages
 * forever, and against a pathologically small cap turning a big relation into
 * an unbounded request storm. At the default page size this covers 1,000,000
 * rows, far past anything these sweeps read.
 */
const MAX_PAGES = 2000

/** The shape of a `count: 'exact'` PostgREST response, narrowed to what this helper reads. */
interface CountedPage<T> {
  data: T[] | null
  error: { message: string } | null
  count: number | null
}

/**
 * Read every row of a query, verifying nothing was silently dropped.
 *
 * The caller builds one page per call. Two requirements, both load-bearing:
 *
 *  - **`{ count: 'exact' }` on the select.** It is what the completeness
 *    assertion compares against; without it there is nothing to verify and the
 *    helper degrades to a plain paging loop.
 *  - **A stable `.order()` on a unique column** (a primary key). `.range()`
 *    windows over an unordered relation may overlap or skip rows between
 *    requests, which would trade a truncation bug for a duplication bug.
 *
 * ```ts
 * const txns = await fetchAllRows('transactions', (from, to) =>
 *   admin
 *     .from('transactions')
 *     .select('tenant_id, amount', { count: 'exact' })
 *     .eq('status', 'successful')
 *     .order('transaction_id')
 *     .range(from, to)
 * )
 * ```
 *
 * @param relation Name used in error messages — the operator needs to know
 *   which read came up short.
 * @throws if a page errors, if the relation is larger than `MAX_PAGES` pages,
 *   or if fewer rows were collected than the server said exist.
 */
export async function fetchAllRows<T>(
  relation: string,
  page: (from: number, to: number) => PromiseLike<CountedPage<T>>,
  pageSize: number = FETCH_ALL_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []
  /**
   * The count reported by the FIRST page — a snapshot of the relation as the
   * sweep started. Later pages report a moving total under concurrent writes;
   * comparing against the snapshot keeps the assertion about truncation rather
   * than about how busy the table is.
   */
  let expected: number | null = null
  /**
   * Shrinks to whatever the server is actually willing to return. PostgREST
   * applies "Max rows" to each ranged request too, so asking for a window
   * wider than the cap yields a short page that is NOT the end of the relation.
   * Adopting the observed size makes the loop correct for any cap without
   * knowing its value.
   */
  let effectivePageSize = pageSize

  for (let request = 0; request < MAX_PAGES; request++) {
    // Offset by rows already collected rather than by page index: it stays
    // correct after `effectivePageSize` shrinks mid-sweep.
    const from = rows.length
    const { data, error, count } = await page(from, from + effectivePageSize - 1)
    if (error) {
      throw new Error(`fetchAllRows(${relation}): page at offset ${from} failed — ${error.message}`)
    }
    if (request === 0) expected = count

    const batch = data ?? []
    rows.push(...batch)

    if (batch.length < effectivePageSize) {
      // Short page. Either the relation is exhausted, or the server capped this
      // request below what we asked for. The count settles it: if rows are
      // still owed and the server just proved it can return `batch.length` at a
      // time, keep going at that size. An empty page means it can return
      // nothing more, and the assertion below turns that into a loud error.
      if (expected != null && rows.length < expected && batch.length > 0) {
        effectivePageSize = batch.length
        continue
      }
      assertComplete(relation, rows.length, expected)
      return rows
    }
    // An exactly-full page is ambiguous — the next one may be empty — so we
    // always ask again. The trailing empty request is expected, not wasteful.
  }

  throw new Error(
    `fetchAllRows(${relation}): still returning full pages after ${MAX_PAGES} requests ` +
      `(${rows.length} rows); refusing to loop further.`,
  )
}

/**
 * The last line of defence. Collecting FEWER rows than the server itself
 * reported is the failure this module exists to catch: the loop above handles
 * the ordinary row cap, so a shortfall here means something else ate rows — the
 * server refusing to return any more, or rows deleted mid-sweep shifting the
 * offsets. Either way the caller's totals would be wrong, so it gets an error
 * instead of a number.
 *
 * Collecting MORE is benign: rows inserted while the sweep ran. Treating that
 * as corruption would fail the platform payouts page whenever a sale lands
 * mid-render.
 */
function assertComplete(relation: string, fetched: number, expected: number | null) {
  if (expected == null) return
  if (fetched < expected) {
    throw new Error(
      `fetchAllRows(${relation}): incomplete read — fetched ${fetched} of ${expected} rows. ` +
        `Any total computed from this would be silently wrong, so nothing is returned.`,
    )
  }
}
