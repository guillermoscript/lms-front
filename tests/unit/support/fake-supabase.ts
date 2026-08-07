/**
 * Minimal in-memory Supabase/PostgREST stand-in for the platform-billing tests
 * (issue #546).
 *
 * The billing lifecycle bugs under test are all about what a query RETURNS for
 * a given table state — a `.single()` that yields `PGRST116 / data: null` once
 * two rows match, an upsert that leaves an unnamed column untouched, a count
 * that does or does not include archived rows. Canned per-call replies cannot
 * express any of that, so the fake keeps real rows and applies real filters.
 *
 * Supported: select (incl. `{count:'exact', head:true}` and one-level embedded
 * `table(cols)`), insert, update, upsert (on a caller-declared conflict key),
 * eq/neq/in/is/not-is/lt/lte/gt/gte, order, limit, range, single, maybeSingle,
 * and awaiting the builder directly. Everything else throws loudly rather than
 * silently returning nothing.
 */

export type Row = Record<string, unknown>
export type Db = Record<string, Row[]>

export interface FakeSupabaseOptions {
  /** Column PostgREST would resolve an embedded `<table>(...)` join on. */
  embeds?: Record<string, { table: string; localKey: string; foreignKey: string }>
  /** Conflict target per table, for `.upsert(..., { onConflict })`. */
  conflictKeys?: Record<string, string>
  /** Emails to hand back from `auth.admin.getUserById`. */
  userEmail?: (id: string) => string | null
  /**
   * Make a write fail the way PostgREST does — `{ data: null, error }` rather
   * than a throw (#550). Needed because the interesting access-cutoff bug is a
   * ledger upsert that errors while the surrounding code reports success, and
   * the most common cause is RLS silently refusing the write, which never
   * throws. Return `null` to let the write proceed normally.
   */
  failWrites?: (
    table: string,
    op: 'insert' | 'update' | 'upsert'
  ) => { code: string; message: string } | null
  /**
   * NOT NULL columns per table, enforced on `insert` and `upsert` (#605).
   *
   * Modelled because an upsert that omits a NOT NULL column fails even when the
   * conflicting row already exists and already has a value for it: PostgREST
   * sends `INSERT … ON CONFLICT DO UPDATE`, and Postgres checks the proposed
   * insert tuple before it resolves the conflict. Without this the fake merges
   * the omitted column away silently and a test cannot tell a working upsert
   * from one that 500s in production.
   *
   * `update` is deliberately not checked — an UPDATE touches only the columns
   * it names, so omitting one is not a violation.
   */
  notNull?: Record<string, string[]>
}

type Predicate = (row: Row) => boolean

export function createFakeSupabase(db: Db, opts: FakeSupabaseOptions = {}) {
  const embeds = opts.embeds ?? {}
  const conflictKeys = opts.conflictKeys ?? {}
  const writes: { table: string; op: 'insert' | 'update' | 'upsert'; values: Row }[] = []

  function embed(cols: string, rows: Row[]): Row[] {
    const attached = Object.entries(embeds).filter(([name]) => cols.includes(`${name}(`))
    if (attached.length === 0) return rows.map((r) => ({ ...r }))
    return rows.map((row) => {
      const out: Row = { ...row }
      for (const [name, cfg] of attached) {
        out[name] =
          (db[cfg.table] || []).find((f) => f[cfg.foreignKey] === row[cfg.localKey]) ?? null
      }
      return out
    })
  }

  function builder(table: string) {
    const preds: Predicate[] = []
    let cols = '*'
    let wantCount = false
    let headOnly = false
    let take = Infinity
    let sort: { col: string; ascending: boolean } | null = null
    let window: { from: number; to: number } | null = null
    let pending: { op: 'insert' | 'update' | 'upsert'; values: Row; onConflict?: string } | null =
      null

    db[table] = db[table] || []

    /** Rows after filters and ordering, before any limit/range window. */
    const filtered = () => {
      const rows = db[table].filter((r) => preds.every((p) => p(r)))
      if (!sort) return rows
      const { col, ascending } = sort
      return [...rows].sort((a, z) => {
        const l = a[col] as never
        const r = z[col] as never
        if (l === r) return 0
        return (l < r ? -1 : 1) * (ascending ? 1 : -1)
      })
    }

    const matched = () => {
      const rows = filtered()
      // `.range()` wins over `.limit()`, matching PostgREST when both are sent.
      if (window) return rows.slice(window.from, window.to + 1)
      return take === Infinity ? rows : rows.slice(0, take)
    }

    function applyWrite(): Row[] {
      const w = pending!
      writes.push({ table, op: w.op, values: { ...w.values } })
      if (w.op === 'update') {
        const rows = matched()
        for (const row of rows) Object.assign(row, w.values)
        return rows
      }
      if (w.op === 'insert') {
        const row = { ...w.values }
        db[table].push(row)
        return [row]
      }
      // upsert
      const key = w.onConflict || conflictKeys[table]
      const existing = key ? db[table].find((r) => r[key] === w.values[key]) : undefined
      if (existing) {
        Object.assign(existing, w.values)
        return [existing]
      }
      const row = { ...w.values }
      db[table].push(row)
      return [row]
    }

    function settle(): { data: unknown; error: unknown; count?: number } {
      if (pending) {
        const failure = opts.failWrites?.(table, pending.op)
        if (failure) {
          // Rejected before it lands, so the table is left untouched — exactly
          // what an RLS refusal looks like to the caller.
          pending = null
          return { data: null, error: failure }
        }
        if (pending.op === 'insert' || pending.op === 'upsert') {
          const values = pending.values ?? {}
          const missing = (opts.notNull?.[table] ?? []).find(
            (col) => values[col] === undefined || values[col] === null
          )
          if (missing) {
            pending = null
            return {
              data: null,
              error: {
                code: '23502',
                message: `null value in column "${missing}" of relation "${table}" violates not-null constraint`,
              },
            }
          }
        }
        const rows = applyWrite()
        return { data: embed(cols, rows), error: null }
      }
      const rows = matched()
      if (wantCount) {
        return { data: headOnly ? null : embed(cols, rows), error: null, count: filtered().length }
      }
      return { data: embed(cols, rows), error: null }
    }

    const one = (allowEmpty: boolean) => {
      const settled = settle()
      const rows = (settled.data as Row[] | null) || []
      if (rows.length === 1) return { data: rows[0], error: null }
      if (rows.length === 0) {
        return allowEmpty
          ? { data: null, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows returned' } }
      }
      // What PostgREST really does with 2+ rows, and the reason the duplicate
      // guards this suite covers silently passed.
      return {
        data: null,
        error: { code: 'PGRST116', message: 'more than one row returned' },
      }
    }

    const b: Record<string, unknown> = {
      select(c = '*', o?: { count?: string; head?: boolean }) {
        cols = c
        wantCount = o?.count === 'exact'
        headOnly = o?.head === true
        return b
      },
      insert(values: Row) {
        pending = { op: 'insert', values }
        return b
      },
      update(values: Row) {
        pending = { op: 'update', values }
        return b
      },
      upsert(values: Row, o?: { onConflict?: string }) {
        pending = { op: 'upsert', values, onConflict: o?.onConflict }
        return b
      },
      eq(col: string, val: unknown) {
        preds.push((r) => r[col] === val)
        return b
      },
      neq(col: string, val: unknown) {
        preds.push((r) => r[col] !== val)
        return b
      },
      in(col: string, vals: unknown[]) {
        preds.push((r) => vals.includes(r[col] as never))
        return b
      },
      is(col: string, val: unknown) {
        preds.push((r) => (val === null ? r[col] == null : r[col] === val))
        return b
      },
      not(col: string, op: string, val: unknown) {
        if (op !== 'is') throw new Error(`fake-supabase: unsupported not(${op})`)
        preds.push((r) => (val === null ? r[col] != null : r[col] !== val))
        return b
      },
      lt: cmp(preds, (a, c) => a < c),
      lte: cmp(preds, (a, c) => a <= c),
      gt: cmp(preds, (a, c) => a > c),
      gte: cmp(preds, (a, c) => a >= c),
      order(col?: string, o?: { ascending?: boolean }) {
        if (col) sort = { col, ascending: o?.ascending !== false }
        return b
      },
      /**
       * Keyset window used by `fetchAllRows`. `count` deliberately stays the
       * FULL match count, as PostgREST reports it — that is the number
       * `fetchAllRows` asserts completeness against, so returning a per-page
       * count here would make a truncated sweep look complete.
       */
      range(from: number, to: number) {
        window = { from, to }
        return b
      },
      limit(n: number) {
        take = n
        return b
      },
      single: () => Promise.resolve(one(false)),
      maybeSingle: () => Promise.resolve(one(true)),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    }

    function cmp(list: Predicate[], op: (a: number, c: number) => boolean) {
      return (col: string, val: string | number) => {
        list.push((r) => {
          const raw = r[col]
          if (raw == null) return false
          const left = typeof raw === 'number' ? raw : new Date(raw as string).getTime()
          const right = typeof val === 'number' ? val : new Date(val).getTime()
          return op(left, right)
        })
        return b
      }
    }

    return b
  }

  return {
    client: {
      from: (table: string) => builder(table),
      auth: {
        admin: {
          getUserById: (id: string) =>
            Promise.resolve({
              data: { user: { email: opts.userEmail ? opts.userEmail(id) : `${id}@example.com` } },
              error: null,
            }),
        },
      },
    },
    writes,
  }
}
