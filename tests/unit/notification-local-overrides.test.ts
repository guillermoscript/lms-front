import { describe, expect, it } from 'vitest'
import { applyLocalOverrides, withIds } from '@/lib/notifications/local-overrides'

/**
 * Issue #870 review: the notifications page copied its rows into state once,
 * so a later server render (Try again after a failed read, mark-all from the
 * bell) never reached the list. It now derives the list from the latest server
 * rows plus what the tab did.
 */

const row = (id: number, in_app_read: boolean | null = false) => ({ id, in_app_read })
const none = { read: new Set<number>(), dismissed: new Set<number>() }

describe('applyLocalOverrides', () => {
  it('shows new server rows: a retry after a failed read renders the list', () => {
    const afterError = applyLocalOverrides([], none)
    expect(afterError).toEqual([])
    // Same overrides, new props from router.refresh().
    expect(applyLocalOverrides([row(1), row(2, true)], none)).toEqual([row(1), row(2, true)])
  })

  it('follows the server when it says a row is read (mark-all from the bell)', () => {
    expect(applyLocalOverrides([row(1, true), row(2, true)], none).every((r) => r.in_app_read)).toBe(true)
  })

  it('keeps what this tab did on top of the server rows', () => {
    const rows = [row(1), row(2), row(3)]
    const out = applyLocalOverrides(rows, { read: new Set([1]), dismissed: new Set([3]) })
    expect(out).toEqual([row(1, true), row(2)])
    // The input is not mutated.
    expect(rows[0].in_app_read).toBe(false)
  })

  it('never marks a row the tab did not touch — a new unread row after mark-all stays unread', () => {
    const readBefore = withIds(new Set(), [1, 2])
    const out = applyLocalOverrides([row(3), row(1), row(2)], { read: readBefore, dismissed: new Set() })
    expect(out).toEqual([row(3), row(1, true), row(2, true)])
  })
})

describe('withIds', () => {
  it('returns a new set with the ids added', () => {
    const before = new Set([1])
    const after = withIds(before, [2, 3])
    expect([...after]).toEqual([1, 2, 3])
    expect(after).not.toBe(before)
    expect([...before]).toEqual([1])
  })
})
