'use client'

import { IconFilter } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface PostFiltersProps {
  activeType: string | null
  activeRole: string | null
  onTypeChange: (type: string | null) => void
  onRoleChange: (role: string | null) => void
}

export function PostFilters({ activeType, activeRole, onTypeChange, onRoleChange }: PostFiltersProps) {
  const t = useTranslations('community')

  const typeFilters = [
    { value: null, label: t('filters.all') },
    { value: 'standard', label: t('filters.posts') },
    { value: 'discussion_prompt', label: t('filters.discussions') },
    { value: 'poll', label: t('filters.polls') },
    { value: 'milestone', label: t('filters.milestones') },
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
        {typeFilters.map((filter) => (
          <button
            key={filter.value ?? 'all'}
            onClick={() => onTypeChange(filter.value)}
            className={cn(
              'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors',
              activeType === filter.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {roleFilters.map((filter) => (
          <button
            key={filter.value ?? 'all-roles'}
            onClick={() => onRoleChange(filter.value)}
            className={cn(
              'inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium transition-colors',
              activeRole === filter.value
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  )
}
