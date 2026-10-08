'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { EnrolledCourseCard } from '@/components/student/enrolled-course-card'
import { ListToolbar, matchesQuery } from '@/components/student/list-toolbar'
import type { CourseAccess } from '@/lib/services/enrollment-service'

export interface MyCourseItem {
  enrollment_id: number
  access: CourseAccess
  course: { title: string; description: string | null; progress: number }
}

type Status = 'all' | 'in_progress' | 'completed' | 'not_started'
type Sort = 'recent' | 'title' | 'progress'

/** Search / filter / sort for the student's enrolled courses (client-side). */
export function MyCoursesExplorer({
  enrollments,
  userId,
}: {
  enrollments: MyCourseItem[]
  userId: string
}) {
  const t = useTranslations('dashboard.student.courses')
  const tf = useTranslations('components.courseFilters')
  const locale = useLocale()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [sort, setSort] = useState<Sort>('recent')

  const statusKeys = {
    all: 'allCourses',
    in_progress: 'inProgress',
    completed: 'completed',
    not_started: 'notStarted',
  } as const
  const sortKeys = { recent: 'mostRecent', title: 'titleAZ', progress: 'progress' } as const

  const statuses = (Object.keys(statusKeys) as Status[]).map((value) => ({
    value,
    label: tf(statusKeys[value]),
  }))
  const sorts = (Object.keys(sortKeys) as Sort[]).map((value) => ({
    value,
    label: tf(sortKeys[value]),
  }))

  const visible = enrollments
    .filter((e) => {
      const p = e.course.progress
      if (status === 'completed' && p < 100) return false
      if (status === 'in_progress' && (p === 0 || p >= 100)) return false
      if (status === 'not_started' && p > 0) return false
      return matchesQuery(search, locale, e.course.title, e.course.description)
    })
    .sort((a, b) => {
      if (sort === 'title') return a.course.title.localeCompare(b.course.title, locale)
      if (sort === 'progress') return b.course.progress - a.course.progress
      return 0
    })

  const filtered = search !== '' || status !== 'all'

  function reset() {
    setSearch('')
    setStatus('all')
  }

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel={t('search')}
        searchPlaceholder={tf('searchPlaceholder')}
        selects={[
          {
            id: 'status',
            label: t('status'),
            value: status,
            options: statuses,
            onChange: (v) => setStatus(v as Status),
          },
          {
            id: 'sort',
            label: tf('sortBy'),
            value: sort,
            options: sorts,
            onChange: (v) => setSort(v as Sort),
          },
        ]}
        resultsText={t('results', { count: visible.length, total: enrollments.length })}
        showReset={filtered}
        onReset={reset}
        resetLabel={t('reset')}
      />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <p className="font-medium">{t('noMatches')}</p>
          <p className="text-sm text-muted-foreground">{t('noMatchesHint')}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            {t('reset')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {visible.map((enrollment) => (
            <EnrolledCourseCard
              key={enrollment.enrollment_id}
              enrollment={enrollment}
              userId={userId}
              access={enrollment.access}
            />
          ))}
        </div>
      )}
    </div>
  )
}
