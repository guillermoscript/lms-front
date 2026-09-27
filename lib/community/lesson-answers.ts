/**
 * What a lesson's prompt card knows about its answers (#869). Pure and
 * client-safe.
 *
 * The server sends a count and an "answered" flag with the lesson. Once the
 * prompt's thread has loaded it knows better — it holds the visible answers —
 * so every thread load replaces them: a posted answer, a deleted one and a
 * block all land the same way.
 *
 * Answers posted from the lesson skip revalidation (see `createComment`), so
 * the lesson's cached payload never learns about them, and Next re-renders
 * browser Back from that cache. The memory keeps what a thread saw against the
 * server read it was showing (`loadId`): the same read again — Back — gets it
 * back; any newer read from the server wins.
 */

export type AnswerState = {
  count: number
  answered: boolean
  /** The viewer's latest answer, for "View in community" to land on. */
  lastAnswerId: string | null
}

/** From the thread's top-level comments, by the rules the server counts with. */
export function answerStateFromThread(
  roots: { id: string; author_id: string }[],
  viewerId: string
): AnswerState {
  const own = roots.filter((c) => c.author_id === viewerId)
  return { count: roots.length, answered: own.length > 0, lastAnswerId: own.at(-1)?.id ?? null }
}

/**
 * An answer this viewer just posted. A no-op when the thread's reload already
 * showed it; otherwise (the reload failed) it is counted here.
 */
export function withPostedAnswer(state: AnswerState, commentId: string): AnswerState {
  if (state.lastAnswerId === commentId) return state
  return { count: state.count + 1, answered: true, lastAnswerId: commentId }
}

export function createAnswerMemory() {
  const seen = new Map<string, { loadId: string; state: AnswerState }>()
  return {
    /** What a thread last saw for this prompt, if it saw it in this same read. */
    recall(promptId: string, loadId: string): AnswerState | null {
      const entry = seen.get(promptId)
      return entry && entry.loadId === loadId ? entry.state : null
    },
    remember(promptId: string, loadId: string, state: AnswerState) {
      seen.set(promptId, { loadId, state })
    },
  }
}
