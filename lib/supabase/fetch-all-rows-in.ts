/**
 * Complete reads for `.in(column, ids)` lookups (issue #548).
 *
 * `fetchAllRows` (#533) fixes truncation on the RESPONSE side. An `.in()`
 * lookup has a second, independent ceiling on the REQUEST side: PostgREST
 * takes the id list as a URL query parameter, so a few hundred uuids already
 * push the request past the gateway's URL limit and the read fails outright
 * (or, worse, is quietly rewritten). Paging the response does not help — the
 * request never gets to be made.
 *
 * Both ceilings bite the same callers, because the id lists here are derived
 * from the very sweeps #533 unbounded: the daily digest looks up notification
 * preferences for every candidate student platform-wide, so `userIds` is
 * exactly as large as the candidate set. A student missing from a truncated
 * preferences read falls through `resolveChannels(undefined)` to
 * `{ inApp: true, email: true }` — they get emailed *because* the read was
 * short, having explicitly opted out.
 *
 * So: chunk the ids, and read each chunk through `fetchAllRows` so the
 * response side stays verified too.
 */

import { fetchAllRows } from './fetch-all-rows'

/**
 * Ids per request. At 36 bytes per uuid plus PostgREST's `in.(...)` quoting
 * and percent-encoding, 200 ids is roughly a 10KB query string — comfortably
 * inside the 16KB most gateways (Kong included) allow, with room for the rest
 * of the URL. Smaller than it needs to be on purpose: the cost of one extra
 * round trip is nothing next to a read that 414s in production.
 */
export const IN_FILTER_CHUNK_SIZE = 200

/** The shape of a `count: 'exact'` PostgREST response, narrowed to what this helper reads. */
interface CountedPage<T> {
  data: T[] | null
  error: { message: string } | null
  count: number | null
}

/** Split into fixed-size chunks, preserving order. */
export function chunkIds<Id>(ids: readonly Id[], size: number = IN_FILTER_CHUNK_SIZE): Id[][] {
  if (size < 1) throw new Error(`chunkIds: size must be >= 1, got ${size}`)
  const out: Id[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

/**
 * Read every row matching `.in(column, ids)`, for any number of ids.
 *
 * Duplicate ids are collapsed first — they cost URL budget and buy nothing.
 * Each chunk is read through `fetchAllRows`, so the caller's `page` builder
 * carries the same two obligations as there: `{ count: 'exact' }` on the
 * select, and a stable `.order()` on a primary key.
 *
 * ```ts
 * const prefs = await fetchAllRowsIn('notification_preferences', userIds, (chunk, from, to) =>
 *   admin
 *     .from('notification_preferences')
 *     .select('user_id, email_enabled', { count: 'exact' })
 *     .in('user_id', chunk)
 *     .order('id')
 *     .range(from, to)
 * )
 * ```
 *
 * Chunks are read sequentially rather than with `Promise.all`: these are
 * service-role sweeps running in cron routes, where a burst of concurrent
 * requests against the same table is a worse failure mode than taking a few
 * extra seconds.
 *
 * @param relation Name used in error messages.
 * @param ids Full id list. An empty list short-circuits — no request is made.
 * @throws whatever `fetchAllRows` throws, including its completeness assertion.
 */
export async function fetchAllRowsIn<T, Id>(
  relation: string,
  ids: readonly Id[],
  page: (chunk: Id[], from: number, to: number) => PromiseLike<CountedPage<T>>,
  chunkSize: number = IN_FILTER_CHUNK_SIZE,
): Promise<T[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []

  const rows: T[] = []
  for (const chunk of chunkIds(unique, chunkSize)) {
    rows.push(...(await fetchAllRows<T>(relation, (from, to) => page(chunk, from, to))))
  }
  return rows
}
