/**
 * Page Architect client op queue (WP2, design §3.6, critique B2/H).
 *
 * A fake `requestAnimationFrame` makes frames explicit: ops that arrive within one tick flush
 * together and in order; typewriter chunks are paced one per frame; `drain()` resolves only
 * once everything queued has applied; `close()` drops the rest.
 */
import { describe, expect, it } from 'vitest'
import { applyOpInPlace, emptyPage, ROOT_ZONE, type PageData, type PageOp } from '@lms/core'
import { OpQueue, chunkText, isTypewriterText } from '@/components/admin/landing-page/page-architect/op-queue'

function fakeRaf() {
  let pending: Array<() => void> = []
  return {
    raf: (cb: () => void) => {
      pending.push(cb)
      return pending.length
    },
    /** Run one frame; returns how many callbacks ran. */
    tick(): number {
      const run = pending
      pending = []
      for (const cb of run) cb()
      return run.length
    },
    /** Run frames until nothing is scheduled. */
    flushAll(max = 500): number {
      let frames = 0
      while (pending.length && frames < max) {
        this.tick()
        frames++
      }
      return frames
    },
    get scheduled() {
      return pending.length
    },
  }
}

function recorder() {
  const applied: PageOp[] = []
  return {
    applied,
    apply: (op: PageOp) => {
      applied.push(op)
      return { applied: true }
    },
  }
}

const add = (id: string, props: Record<string, unknown> = {}, index = 0): PageOp => ({
  op: 'add',
  id,
  type: 'HeroBlock',
  zone: ROOT_ZONE,
  index,
  props,
})

const LONG = 'Learn to build real products with a mentor who answers every question within a day.'

describe('OpQueue batching', () => {
  it('applies every op that arrived before a frame in that one frame, in arrival order', () => {
    const frame = fakeRaf()
    const rec = recorder()
    const queue = new OpQueue({ apply: rec.apply, raf: frame.raf, typewriter: false })
    queue.push(add('a'))
    queue.push(add('b', {}, 1))
    queue.push({ op: 'update', id: 'a', props: { title: 'Hi' } })
    queue.push({ op: 'remove', id: 'b' })

    expect(rec.applied).toHaveLength(0) // nothing before the frame
    expect(frame.scheduled).toBe(1) // one frame scheduled for the whole burst
    frame.tick()
    expect(rec.applied.map((o) => o.op)).toEqual(['add', 'add', 'update', 'remove'])
    expect(queue.frames).toBe(1)
    expect(queue.applied).toBe(4)
    expect(frame.scheduled).toBe(0)
  })

  it('schedules a new frame for ops that arrive after a flush', () => {
    const frame = fakeRaf()
    const rec = recorder()
    const queue = new OpQueue({ apply: rec.apply, raf: frame.raf, typewriter: false })
    queue.push(add('a'))
    frame.tick()
    queue.push(add('b'))
    expect(frame.scheduled).toBe(1)
    frame.tick()
    expect(rec.applied.map((o) => ('id' in o ? o.id : ''))).toEqual(['a', 'b'])
    expect(queue.frames).toBe(2)
  })

  it('counts skipped ops apart from applied ones', () => {
    const frame = fakeRaf()
    const queue = new OpQueue({
      apply: (op) => (op.op === 'remove' ? { applied: false, warning: 'no block' } : { applied: true }),
      raf: frame.raf,
      typewriter: false,
    })
    const warnings: string[] = []
    const q2 = new OpQueue({
      apply: () => ({ applied: false, warning: 'nope' }),
      raf: frame.raf,
      typewriter: false,
      onWarning: (w) => warnings.push(w),
    })
    queue.push(add('a'))
    queue.push({ op: 'remove', id: 'zz' })
    q2.push(add('x'))
    frame.flushAll()
    expect(queue.applied).toBe(1)
    expect(queue.skipped).toBe(1)
    expect(warnings).toEqual(['nope'])
  })
})

describe('OpQueue defaults', () => {
  // Live QA: PageArchitectTurn forwards `raf: opts.raf`, which is undefined in the editor; a
  // spread over the defaults turned that into "this.opts.raf is not a function" on the first op.
  it('an explicit undefined option still gets the default scheduler', async () => {
    const rec = recorder()
    const queue = new OpQueue({ apply: rec.apply, raf: undefined, typewriter: undefined })
    queue.push(add('a'))
    await queue.drain()
    expect(rec.applied).toHaveLength(1)
  })
})

describe('OpQueue drain / close', () => {
  it('drain() resolves only after every queued op applied', async () => {
    const frame = fakeRaf()
    const rec = recorder()
    const queue = new OpQueue({ apply: rec.apply, raf: frame.raf, typewriter: false })
    queue.push(add('a'))
    queue.push(add('b'))
    let drained = false
    const done = queue.drain().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    frame.flushAll()
    await done
    expect(drained).toBe(true)
    expect(rec.applied).toHaveLength(2)
  })

  it('drain() on an idle queue resolves immediately', async () => {
    const queue = new OpQueue({ apply: () => ({ applied: true }), raf: fakeRaf().raf })
    await expect(queue.drain()).resolves.toBeUndefined()
  })

  it('close() drops pending ops, refuses new ones and releases drain()', async () => {
    const frame = fakeRaf()
    const rec = recorder()
    const queue = new OpQueue({ apply: rec.apply, raf: frame.raf, typewriter: false })
    queue.push(add('a'))
    const done = queue.drain()
    queue.close()
    await done
    queue.push(add('b'))
    frame.flushAll()
    expect(rec.applied).toHaveLength(0)
    expect(queue.isClosed).toBe(true)
  })
})

describe('OpQueue typewriter (critique B2)', () => {
  it('types long text that arrived whole over several frames, and the result is exact', () => {
    const frame = fakeRaf()
    const page: PageData = emptyPage()
    const queue = new OpQueue({
      apply: (op) => ({ applied: applyOpInPlace(page, op) === null }),
      raf: frame.raf,
      typewriterMaxFrames: 10,
    })
    queue.push(add('hero', { title: 'Short', subtitle: LONG, primaryCtaHref: '/courses' }))

    frame.tick()
    // First frame: the block exists with the long field blanked and the rest intact.
    expect(page.content[0].props).toMatchObject({ title: 'Short', subtitle: '', primaryCtaHref: '/courses' })

    frame.tick()
    const partial = page.content[0].props.subtitle as string
    expect(partial.length).toBeGreaterThan(0)
    expect(LONG.startsWith(partial)).toBe(true)
    expect(partial.length).toBeLessThan(LONG.length)

    const frames = frame.flushAll()
    expect(frames).toBeGreaterThan(3)
    expect(page.content[0].props.subtitle).toBe(LONG)
    // Synthetic chunks do not count as applied ops.
    expect(queue.applied).toBe(1)
  })

  it('does not type a block the server is already streaming with appends', () => {
    const frame = fakeRaf()
    const rec = recorder()
    const queue = new OpQueue({ apply: rec.apply, raf: frame.raf })
    queue.push(add('hero', { title: '' }))
    queue.push({ op: 'update', id: 'hero', appends: { subtitle: 'Learn ' } })
    queue.push({ op: 'update', id: 'hero', props: { subtitle: LONG } })
    frame.flushAll()
    expect(rec.applied).toHaveLength(3)
    expect(rec.applied[2]).toEqual({ op: 'update', id: 'hero', props: { subtitle: LONG } })
  })

  it('types a block at most once per turn', () => {
    const frame = fakeRaf()
    const rec = recorder()
    const queue = new OpQueue({ apply: rec.apply, raf: frame.raf, typewriterMaxFrames: 5 })
    queue.push(add('hero', { subtitle: LONG }))
    frame.flushAll()
    const typed = rec.applied.length
    expect(typed).toBeGreaterThan(2)
    queue.push({ op: 'update', id: 'hero', props: { subtitle: LONG } })
    frame.flushAll()
    expect(rec.applied).toHaveLength(typed + 1)
  })

  it('is off when disabled (reduced motion) and when a backlog builds up', () => {
    const frame = fakeRaf()
    const off = recorder()
    const q1 = new OpQueue({ apply: off.apply, raf: frame.raf, typewriter: false })
    q1.push(add('a', { subtitle: LONG }))
    frame.flushAll()
    expect(off.applied).toHaveLength(1)

    const backlog = recorder()
    const q2 = new OpQueue({ apply: backlog.apply, raf: frame.raf, typewriterMaxBacklog: 2 })
    q2.push(add('x1'))
    q2.push(add('x2'))
    q2.push(add('x3', { subtitle: LONG }))
    frame.flushAll()
    expect(backlog.applied).toHaveLength(3)
    expect(frame.scheduled).toBe(0)
  })

  it('never types URLs, colours, ids or short text', () => {
    expect(isTypewriterText('subtitle', LONG)).toBe(true)
    expect(isTypewriterText('primaryCtaHref', `https://example.com/${'a b'.repeat(20)}`)).toBe(false)
    expect(isTypewriterText('backgroundImage', LONG)).toBe(false)
    expect(isTypewriterText('accentColor', LONG)).toBe(false)
    expect(isTypewriterText('courseId', LONG)).toBe(false)
    expect(isTypewriterText('title', 'Short title')).toBe(false)
    expect(isTypewriterText('title', 'x'.repeat(80))).toBe(false) // no whitespace: not prose
  })

  it('drops the typed chunks of a block whose add was skipped', () => {
    const frame = fakeRaf()
    const rec: PageOp[] = []
    const queue = new OpQueue({
      apply: (op) => {
        rec.push(op)
        return op.op === 'add' ? { applied: false, warning: 'unknown type' } : { applied: true }
      },
      raf: frame.raf,
    })
    queue.push(add('ghost', { subtitle: LONG }))
    frame.flushAll()
    expect(rec).toHaveLength(1)
    expect(queue.skipped).toBe(1)
  })

  it('chunkText covers the text exactly within the frame budget', () => {
    const chunks = chunkText(LONG, 7)
    expect(chunks.join('')).toBe(LONG)
    expect(chunks.length).toBeLessThanOrEqual(7)
  })
})
