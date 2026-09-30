import { describe, it, expect } from 'vitest'
import { gradeReviewCard, gradeCard, type FsrsRow } from '@lms/core'

/**
 * `gradeReviewCard` (#849) is the one write path every client grades through —
 * web review session, native app, MCP `lms_grade_review`. These pin that it
 * scopes both the read and the write to the caller's own card in this tenant,
 * and writes exactly what the FSRS scheduler computed.
 */

const NOW = new Date('2026-09-27T12:00:00.000Z')

const ROW: FsrsRow = {
  interval_days: 6,
  repetitions: 3,
  due_at: '2026-09-27T00:00:00.000Z',
  last_reviewed_at: '2026-09-21T00:00:00.000Z',
  stability: 12.34,
  difficulty: 5.67,
  fsrs_state: 2,
  lapses: 1,
  learning_steps: 0,
  elapsed_days: 6,
}

type Call = { op: string; args: unknown[] }

/** A PostgREST-shaped chain that records every call and answers from `result`. */
function fakeClient(opts: { row?: FsrsRow | null; readError?: string; writeError?: string }) {
  const reads: Call[] = []
  const writes: Call[] = []
  const client = {
    from(table: string) {
      let log = reads
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a recording stand-in for the PostgREST builder
      const chain: any = {
        select: (...args: unknown[]) => (reads.push({ op: 'select', args }), chain),
        update: (...args: unknown[]) => ((log = writes), writes.push({ op: 'update', args }), chain),
        eq: (...args: unknown[]) => (log.push({ op: 'eq', args }), chain),
        maybeSingle: async () =>
          opts.readError ? { data: null, error: { message: opts.readError } } : { data: opts.row ?? null, error: null },
        then: (resolve: (v: unknown) => void) =>
          resolve({ error: opts.writeError ? { message: opts.writeError } : null }),
      }
      expect(table).toBe('review_cards')
      return chain
    },
    rpc: () => {
      throw new Error('not used')
    },
  }
  return { client, reads, writes }
}

const eqs = (calls: Call[]) => calls.filter((c) => c.op === 'eq').map((c) => c.args)

describe('gradeReviewCard', () => {
  it('reads and writes only the caller’s card in the current tenant', async () => {
    const { client, reads, writes } = fakeClient({ row: ROW })
    const result = await gradeReviewCard(client, 'user-1', 'tenant-1', 42, 'good', NOW)

    expect(result.ok).toBe(true)
    const scope = [
      ['id', 42],
      ['user_id', 'user-1'],
      ['tenant_id', 'tenant-1'],
    ]
    expect(eqs(reads)).toEqual(scope)
    expect(eqs(writes)).toEqual(scope)
  })

  it('writes exactly what the FSRS scheduler computed', async () => {
    const { client, writes } = fakeClient({ row: ROW })
    const result = await gradeReviewCard(client, 'user-1', 'tenant-1', 42, 'hard', NOW)

    const expected = gradeCard(ROW, 'hard', NOW)
    expect(writes.find((c) => c.op === 'update')?.args[0]).toEqual(expected)
    expect(result).toEqual({ ok: true, card_id: 42, rating: 'hard', next: expected })
  })

  it('answers not_found — and writes nothing — for a card that is not the caller’s', async () => {
    const { client, writes } = fakeClient({ row: null })
    const result = await gradeReviewCard(client, 'user-1', 'tenant-1', 99, 'easy', NOW)

    expect(result).toMatchObject({ ok: false, reason: 'not_found' })
    expect(writes).toEqual([])
  })

  it('surfaces a failed write as an error, not a success', async () => {
    const { client } = fakeClient({ row: ROW, writeError: 'permission denied' })
    const result = await gradeReviewCard(client, 'user-1', 'tenant-1', 42, 'again', NOW)

    expect(result).toMatchObject({ ok: false, reason: 'error' })
    expect(!result.ok && result.message).toContain('permission denied')
  })
})
