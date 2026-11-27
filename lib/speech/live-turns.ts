import type { ConversationTurn } from '@/lib/speech/conversation'

interface Fragment {
  speaker: 'user' | 'assistant'
  delta: string
  startMs: number
}

/**
 * GPT-Live streams transcript fragments per speaker. Order them by when they
 * were spoken, then join runs from the same speaker into one turn (a student
 * who barges in splits the tutor's line, and the tutor's resumed words stay
 * a separate turn after theirs).
 */
export function liveTurns(fragments: readonly Fragment[]): ConversationTurn[] {
  const ordered = [...fragments].sort((a, b) => a.startMs - b.startMs)
  const turns: ConversationTurn[] = []
  for (const f of ordered) {
    const last = turns[turns.length - 1]
    if (last && last.role === f.speaker) last.text += f.delta
    else turns.push({ role: f.speaker, text: f.delta })
  }
  return turns
    .map((t) => ({ ...t, text: t.text.replace(/\s+/g, ' ').trim() }))
    .filter((t) => t.text.length > 0)
}
