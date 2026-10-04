/**
 * The notifications page (#870) renders the SERVER's rows with what this tab
 * already did laid on top — rows it marked read, rows it dismissed — instead of
 * copying the rows into state once. A copy ignored every later server render:
 * "Try again" after a failed read, and a mark-all from the header bell, both
 * refresh the props and left the page showing the stale list.
 *
 * Overrides only ever move a row towards read or gone, which the server agrees
 * with once it catches up: a read row is never unread again (the next reply
 * opens a NEW row with a new id), so an id kept here never hides fresh news.
 */

export interface LocalOverrides {
  read: ReadonlySet<number>
  dismissed: ReadonlySet<number>
}

export function applyLocalOverrides<T extends { id: number; in_app_read: boolean | null }>(
  rows: readonly T[],
  { read, dismissed }: LocalOverrides
): T[] {
  const out: T[] = []
  for (const row of rows) {
    if (dismissed.has(row.id)) continue
    out.push(read.has(row.id) && !row.in_app_read ? { ...row, in_app_read: true } : row)
  }
  return out
}

/** `set` plus `ids`, as a new set (state updates must not mutate). */
export function withIds(set: ReadonlySet<number>, ids: Iterable<number>): ReadonlySet<number> {
  const next = new Set(set)
  for (const id of ids) next.add(id)
  return next
}
