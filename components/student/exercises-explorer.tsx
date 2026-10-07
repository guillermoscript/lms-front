'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { IconBarbell } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import ExerciseCard from '@/components/exercises/exercise-card'
import ExerciseTypeFilter, { ALL_TYPES } from '@/components/exercises/exercise-type-filter'
import { exerciseTypeCounts } from '@/components/exercises/exercise-type-meta'
import { ListToolbar, matchesQuery } from '@/components/student/list-toolbar'

export interface StudentExercise {
  id: number
  title: string
  description?: string | null
  exercise_type: string
  difficulty_level?: string | null
  time_limit?: number | null
  exercise_completions?: unknown[] | null
}

type Status = 'all' | 'pending' | 'completed'
type Sort = 'default' | 'title' | 'difficulty'

const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 }

/** Search / status / type / sort for a student's exercise list. */
export function ExercisesExplorer({
  exercises,
  courseId,
}: {
  exercises: StudentExercise[]
  courseId: string
}) {
  const t = useTranslations('exercises.list')
  const locale = useLocale()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [type, setType] = useState<string>(ALL_TYPES)
  const [sort, setSort] = useState<Sort>('default')

  const types = useMemo(() => exerciseTypeCounts(exercises), [exercises])

  const isDone = (e: StudentExercise) => (e.exercise_completions?.length ?? 0) > 0

  const visible = exercises
    .filter(
      (e) =>
        matchesQuery(search, locale, e.title, e.description) &&
        (status === 'all' || (status === 'completed') === isDone(e)) &&
        (type === ALL_TYPES || e.exercise_type === type)
    )
    .sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, locale) || a.id - b.id
      if (sort === 'difficulty') {
        const ra = DIFFICULTY_RANK[a.difficulty_level ?? ''] ?? 99
        const rb = DIFFICULTY_RANK[b.difficulty_level ?? ''] ?? 99
        return ra - rb || a.id - b.id
      }
      return 0
    })

  const filtered = search !== '' || status !== 'all' || type !== ALL_TYPES

  function reset() {
    setSearch('')
    setStatus('all')
    setType(ALL_TYPES)
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel={t('search')}
        searchPlaceholder={t('searchPlaceholder')}
        selects={[
          {
            id: 'status',
            label: t('status'),
            value: status,
            options: [
              { value: 'all', label: t('statusAll') },
              { value: 'pending', label: t('statusPending') },
              { value: 'completed', label: t('completed') },
            ],
            onChange: (v) => setStatus(v as Status),
          },
          {
            id: 'sort',
            label: t('sort'),
            value: sort,
            options: [
              { value: 'default', label: t('sortDefault') },
              { value: 'title', label: t('sortTitle') },
              { value: 'difficulty', label: t('sortDifficulty') },
            ],
            onChange: (v) => setSort(v as Sort),
          },
        ]}
        resultsText={t('results', { count: visible.length, total: exercises.length })}
        showReset={filtered}
        onReset={reset}
        resetLabel={t('reset')}
      />

      <ExerciseTypeFilter types={types} total={exercises.length} value={type} onChange={setType} />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <IconBarbell className="h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
          <p className="font-medium">{t('noMatches')}</p>
          <p className="text-sm text-muted-foreground">{t('noMatchesHint')}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            {t('reset')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} courseId={courseId} />
          ))}
        </div>
      )}
    </div>
  )
}
