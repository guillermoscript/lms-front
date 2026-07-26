import { describe, expect, it } from 'vitest'
import { chunkIds, fetchAllRowsIn, IN_FILTER_CHUNK_SIZE } from '@/lib/supabase/fetch-all-rows-in'

/**
 * `.in()` lookups have two independent ceilings (issue #548): the response row
 * cap that `fetchAllRows` handles, and the request URL length that only
 * chunking handles. These cover the chunking half and the composition of both.
 */

/** A fake PostgREST that only knows rows whose id is in the requested chunk. */
function serverOver(rows: Array<{ id: number }>, options: { serverCap?: number } = {}) {
  const requests: Array<{ ids: number[]; from: number; to: number }> = []
  const page = async (chunk: number[], from: number, to: number) => {
    requests.push({ ids: chunk, from, to })
    const matching = rows.filter((r) => chunk.includes(r.id))
    let slice = matching.slice(from, to + 1)
    if (options.serverCap != null) slice = slice.slice(0, options.serverCap)
    return { data: slice, error: null, count: matching.length }
  }
  return { page, requests }
}

const rowsUpTo = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }))
const idsUpTo = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('chunkIds', () => {
  it('splits into fixed-size chunks preserving order', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns a single chunk when the list is shorter than the size', () => {
    expect(chunkIds([1, 2], 10)).toEqual([[1, 2]])
  })

  it('returns nothing for an empty list', () => {
    expect(chunkIds([], 10)).toEqual([])
  })

  it('rejects a chunk size below 1 rather than looping forever', () => {
    expect(() => chunkIds([1], 0)).toThrow(/size must be >= 1/)
  })

  it('defaults to a size that keeps the query string well inside gateway limits', () => {
    // 200 uuids ≈ 10KB encoded — the assertion is on the guarantee, not the number.
    expect(IN_FILTER_CHUNK_SIZE).toBeLessThanOrEqual(250)
  })
})

describe('fetchAllRowsIn', () => {
  it('makes no request at all for an empty id list', async () => {
    const { page, requests } = serverOver(rowsUpTo(10))
    await expect(fetchAllRowsIn('t', [], page)).resolves.toEqual([])
    expect(requests).toHaveLength(0)
  })

  it('splits a long id list across several requests and returns every row', async () => {
    const { page, requests } = serverOver(rowsUpTo(1000))
    const rows = await fetchAllRowsIn('t', idsUpTo(1000), page, 100)
    expect(rows).toHaveLength(1000)
    // 10 chunks, each confirmed by a trailing empty page (the chunk is an exact
    // multiple of nothing here — it is short, so one request each).
    expect(requests.map((r) => r.ids.length)).toEqual(Array(10).fill(100))
  })

  it('collapses duplicate ids instead of spending URL budget on them', async () => {
    const { page, requests } = serverOver(rowsUpTo(5))
    const rows = await fetchAllRowsIn('t', [1, 1, 1, 2, 2, 3], page, 100)
    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(requests[0].ids).toEqual([1, 2, 3])
  })

  it('#548: pages WITHIN a chunk when the server caps the response', async () => {
    // Both ceilings at once: 400 ids is too many for one URL, and the server
    // returns at most 30 rows per response. Neither chunking nor paging alone
    // returns all 400 — the id at index 399 is only reachable through both.
    const { page, requests } = serverOver(rowsUpTo(400), { serverCap: 30 })
    const rows = await fetchAllRowsIn('t', idsUpTo(400), page, 100)
    expect(rows).toHaveLength(400)
    expect(rows.at(-1)).toEqual({ id: 399 })
    // 4 chunks × (100/30 rounded up, plus the confirming short page).
    expect(requests.length).toBeGreaterThan(4)
  })

  it('propagates the completeness assertion rather than returning a short set', async () => {
    // A server that reports 100 rows but will only ever hand back 10 is the
    // failure `fetchAllRows` exists to make loud; chunking must not swallow it.
    const stuck = async () => ({ data: [] as Array<{ id: number }>, error: null, count: 100 })
    await expect(fetchAllRowsIn('t', idsUpTo(50), stuck, 100)).rejects.toThrow(/incomplete read/)
  })

  it('surfaces a page error with the relation name', async () => {
    const failing = async () => ({ data: null, error: { message: 'boom' }, count: null })
    await expect(fetchAllRowsIn('prefs', [1], failing)).rejects.toThrow(/fetchAllRows\(prefs\).*boom/)
  })
})
