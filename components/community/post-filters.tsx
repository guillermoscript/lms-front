'use client'

import { IconFilter } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { QuestionFilter } from '@/lib/community/questions'

interface PostFiltersProps {
  activeType: string | null
  activeRole: string | null
  /** `?questions=` (#875): questions, then unanswered / answered ones. */
  questionFilter: QuestionFilter | null
  onTypeChange: (type: string | null) => void
  onRoleChange: (role: string | null) => void
  onQuestionFilterChange: (filter: QuestionFilter | null) => void
}

const chip = (active: boolean) =>
  cn(
    'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors',
    active ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
  )

const subChip = (active: boolean) =>
  cn(
    'inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium transition-colors',
    active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
  )

export function PostFilters({
  activeType,
  activeRole,
  questionFilter,
  onTypeChange,
  onRoleChange,
  onQuestionFilterChange,
}: PostFiltersProps) {
  const t = useTranslations('community')

  const typeFilters = [
    { value: 'standard', label: t('filters.posts') },
    { value: 'discussion_prompt', label: t('filters.discussions') },
    { value: 'poll', label: t('filters.polls') },
    { value: 'milestone', label: t('filters.milestones') },
  ]

  const questionFilters: { value: QuestionFilter; label: string }[] = [
    { value: 'questions', label: t('filters.allQuestions') },
    { value: 'unanswered', label: t('filters.unanswered') },
    { value: 'answered', label: t('filters.answered') },
  ]

  const roleFilters = [
    { value: null, label: t('filters.all') },
    { value: 'teacher', label: t('filters.byTeachers') },
    { value: 'student', label: t('filters.byStudents') },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <IconFilter size={14} className="text-muted-foreground shrink-0" />
        <button
          type="button"
          onClick={() => onTypeChange(null)}
          aria-pressed={!activeType && !questionFilter}
          className={chip(!activeType && !questionFilter)}
        >
          {t('filters.all')}
        </button>
        <button
          type="button"
          onClick={() => onQuestionFilterChange(questionFilter ? null : 'questions')}
          aria-pressed={questionFilter !== null}
          className={chip(questionFilter !== null)}
        >
          {t('filters.questions')}
        </button>
        {typeFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => onTypeChange(filter.value)}
            aria-pressed={activeType === filter.value}
            className={chip(activeType === filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {questionFilter && (
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={t('filters.questions')}>
          {questionFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onQuestionFilterChange(filter.value)}
              aria-pressed={questionFilter === filter.value}
              className={subChip(questionFilter === filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {roleFilters.map((filter) => (
          <button
            key={filter.value ?? 'all-roles'}
            type="button"
            onClick={() => onRoleChange(filter.value)}
            aria-pressed={activeRole === filter.value}
            className={subChip(activeRole === filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  )
}
