import { describe, it, expect } from 'vitest'
import {
  answerStateFromThread,
  createAnswerMemory,
  withPostedAnswer,
  type AnswerState,
} from '@/lib/community/lesson-answers'

/**
 * A lesson prompt card's answer count, "You answered" chip and "View in
 * community" target (#869). The thread is the source of truth once it has
 * loaded; the memory carries that across a remount from a cached render.
 */

const ME = 'viewer-1'
const OTHER = 'viewer-2'
const SERVER: AnswerState = { count: 0, answered: false, lastAnswerId: null }

describe('answerStateFromThread', () => {
  it('counts the visible top-level answers and finds the viewer’s latest', () => {
    const roots = [
      { id: 'c1', author_id: OTHER },
      { id: 'c2', author_id: ME },
      { id: 'c3', author_id: ME },
    ]
    expect(answerStateFromThread(roots, ME)).toEqual({ count: 3, answered: true, lastAnswerId: 'c3' })
  })

  it('drops the chip and the anchor once the viewer’s only answer is deleted', () => {
    // Posted here, then deleted from the thread menu: the reload has no answer of theirs.
    const afterPost = answerStateFromThread([{ id: 'mine', author_id: ME }], ME)
    expect(afterPost).toEqual({ count: 1, answered: true, lastAnswerId: 'mine' })
    expect(answerStateFromThread([], ME)).toEqual(SERVER)
  })

  it('is not "answered" for other people’s answers', () => {
    expect(answerStateFromThread([{ id: 'c1', author_id: OTHER }], ME)).toEqual({
      count: 1,
      answered: false,
      lastAnswerId: null,
    })
  })
})

describe('withPostedAnswer', () => {
  it('changes nothing when the thread’s reload already showed the answer', () => {
    const reloaded = answerStateFromThread(
      [
        { id: 'c1', author_id: OTHER },
        { id: 'c2', author_id: OTHER },
        { id: 'new', author_id: ME },
      ],
      ME
    )
    expect(withPostedAnswer(reloaded, 'new')).toBe(reloaded)
  })

  it('counts the answer itself when the reload did not show it', () => {
    expect(withPostedAnswer({ count: 2, answered: false, lastAnswerId: null }, 'new')).toEqual({
      count: 3,
      answered: true,
      lastAnswerId: 'new',
    })
  })
})

describe('createAnswerMemory', () => {
  it('gives back what the thread saw when the same server read renders again (browser Back)', () => {
    const memory = createAnswerMemory()
    const seen = { count: 1, answered: true, lastAnswerId: 'mine' }
    memory.remember('p1', 'load-1', seen)
    expect(memory.recall('p1', 'load-1')).toEqual(seen)
  })

  it('lets a newer server read win', () => {
    const memory = createAnswerMemory()
    memory.remember('p1', 'load-1', { count: 1, answered: true, lastAnswerId: 'mine' })
    expect(memory.recall('p1', 'load-2')).toBeNull()
  })

  it('keeps prompts apart', () => {
    const memory = createAnswerMemory()
    memory.remember('p1', 'load-1', { count: 1, answered: true, lastAnswerId: 'mine' })
    expect(memory.recall('p2', 'load-1')).toBeNull()
  })
})
