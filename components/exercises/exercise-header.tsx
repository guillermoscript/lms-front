'use client'

import { useTranslations } from 'next-intl'
import Markdown from 'react-markdown'
import { IconCheck } from '@tabler/icons-react'

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
 * One line of sentence-case metadata, not a row of chips: four tinted,
 * uppercase badges above the title were the loudest thing on a page whose
 * subject is the title. Difficulty is a word, so it needs no color to carry it.
 */
export default function ExerciseHeader({
  typeLabel,
  title,
  description,
  difficulty,
  timeLimit,
  completed,
}: ExerciseHeaderProps) {
  const t = useTranslations('exercises.audio')
  const levelLabel = t(
    difficulty === 'hard' ? 'advanced' : difficulty === 'medium' ? 'intermediate' : 'beginner'
  )

  const meta = [typeLabel, levelLabel, timeLimit ? `${timeLimit} min` : null].filter(Boolean)

  return (
    <div className="space-y-2 sm:space-y-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span>{meta.join(' · ')}</span>
        {completed && (
          <span className="flex items-center gap-1 font-medium text-success">
            <IconCheck size={14} aria-hidden="true" />
            {t('completed')}
          </span>
        )}
      </p>

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
