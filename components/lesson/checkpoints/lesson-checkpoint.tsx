'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconChevronDown, IconCircleCheck, IconFlag } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useCheckpoints } from './checkpoints-provider'
import { CheckpointExerciseRenderer } from './checkpoint-exercise-renderer'

interface LessonCheckpointProps {
  /** MDX always passes string literals; numeric ids arrive as strings unless authored with {}. */
  checkpointId: string | number
}

/**
 * Inline checkpoint card rendered from lesson MDX content (`<LessonCheckpoint checkpointId="3" />`).
 * Renders nothing if the checkpoint isn't in context (disabled/deleted server-side).
 */
export function LessonCheckpoint({ checkpointId }: LessonCheckpointProps) {
  const t = useTranslations('components.checkpoints')
  const ctx = useCheckpoints()
  const [expanded, setExpanded] = useState(false)
  const numericId =
    typeof checkpointId === 'number' ? checkpointId : Number.parseInt(checkpointId, 10)

  if (!ctx || !Number.isFinite(numericId)) return null
  const checkpoint = ctx.getCheckpoint(numericId)
  if (!checkpoint) return null

  const isCompleted = checkpoint.latestAttempt?.completed === true
  const title = checkpoint.label || checkpoint.exercise.title

  return (
    <div className="my-6 rounded-lg border bg-card shadow-sm not-prose">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full',
              isCompleted ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'
            )}
          >
            {isCompleted ? <IconCircleCheck className="size-4" /> : <IconFlag className="size-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {checkpoint.isRequired && (
                <Badge variant="outline" className="text-[0.625rem]">
                  {t('requiredBadge')}
                </Badge>
              )}
              {isCompleted && (
                <Badge variant="secondary" className="text-[0.625rem]">
                  {checkpoint.latestAttempt?.score !== null && checkpoint.latestAttempt?.score !== undefined
                    ? t('scoreLabel', { score: Math.round(checkpoint.latestAttempt.score) })
                    : t('completedBadge')}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <IconChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="border-t px-4 py-4">
          <CheckpointExerciseRenderer checkpoint={checkpoint} />
        </div>
      )}
    </div>
  )
}
