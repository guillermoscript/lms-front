import { IconRobot, IconUser } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import type { ConversationTurn } from '@/lib/speech/conversation'

/** Back-to-back turns from one speaker read as one bubble (the model often speaks in bursts). */
function mergeTurns(turns: ConversationTurn[]) {
  const merged: ConversationTurn[] = []
  for (const turn of turns) {
    const last = merged[merged.length - 1]
    if (last && last.role === turn.role) last.text = `${last.text} ${turn.text}`
    else merged.push({ ...turn })
  }
  return merged
}

export function ConversationTranscript({
  turns,
  partnerLabel,
  studentLabel,
}: {
  turns: ConversationTurn[]
  partnerLabel: string
  studentLabel: string
}) {
  return (
    <ol className="space-y-4">
      {mergeTurns(turns).map((turn, i) => {
        const isStudent = turn.role === 'user'
        const Icon = isStudent ? IconUser : IconRobot
        return (
          <li key={i} className={cn('flex flex-col gap-1', isStudent ? 'items-end' : 'items-start')}>
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon size={12} aria-hidden="true" />
              {isStudent ? studentLabel : partnerLabel}
            </span>
            <p
              className={cn(
                'max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                isStudent ? 'rounded-br-sm bg-brand-tint text-foreground' : 'rounded-bl-sm bg-muted text-foreground'
              )}
            >
              {turn.text}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
