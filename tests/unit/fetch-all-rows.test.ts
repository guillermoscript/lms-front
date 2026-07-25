import { describe, expect, it } from 'vitest'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

/**
 * Builds a fake PostgREST pager over `rows`.
 *
 * `serverCap` emulates the API "Max rows" setting: PostgREST clamps EVERY
 * response — including a ranged one — to that many rows while `count` keeps
 * reporting the true total. That is precisely why a short page cannot be read
 * as "the relation is exhausted".
 */
function pagerOver(
  rows: number[],
  options: { serverCap?: number; count?: number | null; growTo?: number[] } = {}
) {
  const calls: Array<{ from: number; to: number }> = []
  const page = async (from: number, to: number) => {
    calls.push({ from, to })
    // A row inserted mid-sweep: later pages see the longer relation.
    const source = calls.length > 1 && options.growTo ? options.growTo : rows
    let slice = source.slice(from, to + 1)
    if (options.serverCap != null) slice = slice.slice(0, options.serverCap)
    return {
      data: slice,
      error: null,
      count: options.count === undefined ? rows.length : options.count,
    }
  }
  return { page, calls }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('fetchAllRows', () => {
  it('returns everything from a single short page without asking again', async () => {
    const { page, calls } = pagerOver(range(3))
    await expect(fetchAllRows('t', page, 10)).resolves.toEqual([0, 1, 2])
    expect(calls).toEqual([{ from: 0, to: 9 }])
  })

  it('handles an empty relation', async () => {
    const { page } = pagerOver([])
    await expect(fetchAllRows('t', page, 10)).resolves.toEqual([])
  })

  it('accumulates multiple pages in order', async () => {
    const { page, calls } = pagerOver(range(25))
    await expect(fetchAllRows('t', page, 10)).resolves.toEqual(range(25))
    expect(calls).toEqual([
      { from: 0, to: 9 },
      { from: 10, to: 19 },
      { from: 20, to: 29 },
    ])
  })

  it('asks once more when the relation is an exact multiple of the page size', async () => {
    // The boundary case: page 2 comes back exactly full, so "full page" alone
    // cannot mean "there is more" — it must be confirmed by an empty page 3.
    const { page, calls } = pagerOver(range(20))
    await expect(fetchAllRows('t', page, 10)).resolves.toEqual(range(20))
    expect(calls).toHaveLength(3)
  })

  it('reads the whole relation when the server caps pages below the requested size', async () => {
    // The #533 scenario as it actually presents: we ask for 1000 rows, the
    // server's "Max rows" is 400, so every page comes back short. Reading that
    // as "exhausted" is exactly the silent truncation the issue describes —
    // here it must still return all 1500 rows.
    const { page, calls } = pagerOver(range(1500), { serverCap: 400 })
    await expect(fetchAllRows('transactions', page, 1000)).resolves.toEqual(range(1500))
    // First request asks for 1000 and gets 400; the rest adopt that width.
    expect(calls[0]).toEqual({ from: 0, to: 999 })
    expect(calls[1]).toEqual({ from: 400, to: 799 })
    expect(calls.at(-1)).toEqual({ from: 1200, to: 1599 })
  })

  it('throws, naming the relation and both counts, when rows go missing anyway', async () => {
    // The server reports 1500 rows but refuses to hand back more than the first
    // 600 — a shortfall the page loop cannot recover from. It must be an error,
    // never a low number.
    let call = 0
    const page = async (from: number, to: number) => {
      call++
      const slice = call <= 2 ? range(1500).slice(from, to + 1).slice(0, 300) : []
      return { data: slice, error: null, count: 1500 }
    }
    await expect(fetchAllRows('transactions', page, 1000)).rejects.toThrow(
      /fetchAllRows\(transactions\): incomplete read — fetched 600 of 1500 rows/
    )
  })

  it('does not throw when rows were inserted while the sweep ran', async () => {
    // First page reports 15; by page 2 the relation has grown to 16. Extra rows
    // are benign — only a shortfall means data was dropped.
    const grown = range(16)
    const { page } = pagerOver(range(15), { growTo: grown })
    await expect(fetchAllRows('t', page, 10)).resolves.toHaveLength(16)
  })

  it('skips the assertion entirely when the caller did not request a count', async () => {
    const { page } = pagerOver(range(5), { count: null })
    await expect(fetchAllRows('t', page, 10)).resolves.toEqual(range(5))
  })

  it('ignores a moving count from later pages and trusts the first page snapshot', async () => {
    let call = 0
    const page = async (from: number, to: number) => {
      call++
      // Page 1 says 15 (the truth at sweep start); page 2 claims 900 because
      // another process is bulk-inserting. Trusting the latest count would
      // manufacture a false "incomplete read".
      return { data: range(15).slice(from, to + 1), error: null, count: call === 1 ? 15 : 900 }
    }
    await expect(fetchAllRows('t', page, 10)).resolves.toEqual(range(15))
  })

  it('propagates a PostgREST error from a later page with its offset', async () => {
    let call = 0
    const page = async (from: number, to: number) => {
      call++
      if (call === 2) return { data: null, error: { message: 'statement timeout' }, count: null }
      return { data: range(25).slice(from, to + 1), error: null, count: 25 }
    }
    await expect(fetchAllRows('payouts', page, 10)).rejects.toThrow(
      /fetchAllRows\(payouts\): page at offset 10 failed — statement timeout/
    )
  })

  it('refuses to loop forever when every page comes back full', async () => {
    // A pathological server that always returns a full page would otherwise
    // spin until the process died.
    const page = async () => ({ data: range(10), error: null, count: null })
    await expect(fetchAllRows('t', page, 10)).rejects.toThrow(/refusing to loop further/)
  })

  it('defaults to a page size of 500', async () => {
    const { page, calls } = pagerOver(range(1))
    await fetchAllRows('t', page)
    expect(calls[0]).toEqual({ from: 0, to: 499 })
  })
})
