'use client'

import { useTranslations } from 'next-intl'
import Markdown from 'react-markdown'
import { IconCheck, IconClock, IconFlame, IconSparkles } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ExerciseHeaderProps {
  typeLabel: string
  title: string
  description?: string | null
  difficulty?: string | null
  timeLimit?: number | null
  completed?: boolean
}

/**
 * Title block shared by every exercise engine.
 *
 * The difficulty inks are `-700 dark:-400`, not `-600`: measured against its
 * own `-500/10` tint, `text-amber-600` came out at 2.94:1, well under AA. Each
 * engine used to carry its own copy of that table, so the failure shipped four
 * times over.
 */
const DIFFICULTY: Record<string, { ink: string; icon: typeof IconFlame }> = {
  easy: {
    ink: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    icon: IconSparkles,
  },
  medium: {
    ink: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
    icon: IconFlame,
  },
  hard: {
    ink: 'text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/25',
    icon: IconFlame,
  },
}

export default function ExerciseHeader({
  typeLabel,
  title,
  description,
  difficulty,
  timeLimit,
  completed,
}: ExerciseHeaderProps) {
  const t = useTranslations('exercises.audio')
  const level = DIFFICULTY[difficulty ?? 'easy'] ?? DIFFICULTY.easy
  const LevelIcon = level.icon
  const levelLabel = t(
    difficulty === 'hard' ? 'advanced' : difficulty === 'medium' ? 'intermediate' : 'beginner'
  )

  const chip = 'font-semibold border text-[10px] px-2.5 py-0.5 uppercase tracking-wider'

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn(chip, 'border-border bg-muted/50 text-foreground')}>
          {typeLabel}
        </Badge>
        <Badge variant="outline" className={cn(chip, level.ink)}>
          <LevelIcon size={11} className="mr-1" aria-hidden="true" />
          {levelLabel}
        </Badge>
        {timeLimit ? (
          <Badge variant="outline" className={cn(chip, 'text-muted-foreground')}>
            <IconClock size={11} className="mr-1" aria-hidden="true" />
            {timeLimit} min
          </Badge>
        ) : null}
        {completed && (
          <Badge
            className={cn(
              chip,
              // -700 on white, -400 on near-black: `bg-emerald-500` behind
              // white text measured 2.47:1 before this.
              'border-transparent bg-emerald-700 text-white dark:bg-emerald-400 dark:text-emerald-950'
            )}
          >
            <IconCheck size={11} className="mr-1" aria-hidden="true" />
            {t('completed')}
          </Badge>
        )}
      </div>

      <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-balance leading-tight">
        {title}
      </h1>

      {description && (
        <div className="text-muted-foreground text-sm md:text-base leading-relaxed max-w-[68ch] prose prose-sm prose-neutral dark:prose-invert prose-p:text-muted-foreground prose-p:leading-relaxed">
          <Markdown>{description}</Markdown>
        </div>
      )}
    </div>
  )
}
