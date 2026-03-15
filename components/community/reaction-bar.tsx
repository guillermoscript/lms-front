'use client'

import { useState } from 'react'
import { IconThumbUp, IconBulb, IconMoodSmile, IconFlame } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toggleReaction } from '@/app/actions/community'

type ReactionType = 'like' | 'helpful' | 'insightful' | 'fire'

interface ReactionBarProps {
  postId: string
  userId: string
  currentReactions: string[]
  reactionCount: number
  onReactionToggled?: () => void
}

const REACTIONS = [
  { type: 'like' as ReactionType, icon: IconThumbUp, label: 'Like' },
  { type: 'helpful' as ReactionType, icon: IconBulb, label: 'Helpful' },
  { type: 'insightful' as ReactionType, icon: IconMoodSmile, label: 'Insightful' },
  { type: 'fire' as ReactionType, icon: IconFlame, label: 'Fire' },
] as const

export function ReactionBar({
  postId,
  userId,
  currentReactions,
  reactionCount,
  onReactionToggled,
}: ReactionBarProps) {
  const [optimisticReactions, setOptimisticReactions] = useState<string[]>(currentReactions)
  const [optimisticCount, setOptimisticCount] = useState(reactionCount)
  const [isToggling, setIsToggling] = useState(false)

  async function handleToggle(reactionType: ReactionType) {
    if (isToggling) return
    setIsToggling(true)

    const hadReaction = optimisticReactions.includes(reactionType)

    // Optimistic update
    if (hadReaction) {
      setOptimisticReactions((prev) => prev.filter((r) => r !== reactionType))
      setOptimisticCount((prev) => Math.max(0, prev - 1))
    } else {
      setOptimisticReactions((prev) => [...prev, reactionType])
      setOptimisticCount((prev) => prev + 1)
    }

    try {
      await toggleReaction('post', postId, reactionType)
      onReactionToggled?.()
    } catch {
      // Revert on error
      if (hadReaction) {
        setOptimisticReactions((prev) => [...prev, reactionType])
        setOptimisticCount((prev) => prev + 1)
      } else {
        setOptimisticReactions((prev) => prev.filter((r) => r !== reactionType))
        setOptimisticCount((prev) => Math.max(0, prev - 1))
      }
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map(({ type, icon: Icon, label }) => {
        const isActive = optimisticReactions.includes(type)
        return (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 gap-1 px-2 text-xs',
              isActive
                ? 'text-primary bg-primary/10 hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => handleToggle(type)}
            aria-label={label}
          >
            <Icon size={14} className={cn(isActive && 'fill-current')} />
          </Button>
        )
      })}
      {optimisticCount > 0 && (
        <span className="text-[11px] text-muted-foreground ml-1">{optimisticCount}</span>
      )}
    </div>
  )
}
