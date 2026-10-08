'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import ExamCard from '@/components/exercises/exam-card'
import { ListToolbar, matchesQuery } from '@/components/student/list-toolbar'

export interface StudentExam {
  exam_id: number
  title: string
  description: string | null
  sequence: number | null
  /** Passed straight through to ExamCard */
  [key: string]: unknown
}

type Status = 'all' | 'not_started' | 'submitted' | 'completed'
type Sort = 'order' | 'title'

function examStatus(exam: StudentExam): Exclude<Status, 'all'> {
  const subs = exam.exam_submissions as
    | { score?: number | null; exam_scores?: { score?: number | null }[] | null }[]
    | null
    | undefined
  const submission = subs?.[0]
  if (!submission) return 'not_started'
  const score = submission.score ?? submission.exam_scores?.[0]?.score
  return score !== undefined && score !== null ? 'completed' : 'submitted'
}

/** Search / status filter / sort for a student's exam list. */
export function ExamsExplorer({ exams, courseId }: { exams: StudentExam[]; courseId: string }) {
  const t = useTranslations('exams.list')
  const locale = useLocale()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [sort, setSort] = useState<Sort>('order')

  const statusKeys = {
    all: 'statusAll',
    not_started: 'statusNotStarted',
    submitted: 'statusSubmitted',
    completed: 'statusCompleted',
  } as const
  const statuses = (['all', 'not_started', 'submitted', 'completed'] as const).map((value) => ({
    value,
    label: t(statusKeys[value]),
  }))
  const sorts = [
    { value: 'order', label: t('sortOrder') },
    { value: 'title', label: t('sortTitle') },
  ]

  const visible = exams
    .filter(
      (e) =>
        matchesQuery(search, locale, e.title, e.description) &&
        (status === 'all' || examStatus(e) === status)
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, locale) || a.exam_id - b.exam_id
        : (a.sequence ?? 0) - (b.sequence ?? 0) || a.exam_id - b.exam_id
    )
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
        searchPlaceholder={t('searchPlaceholder')}
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
            label: t('sort'),
            value: sort,
            options: sorts,
            onChange: (v) => setSort(v as Sort),
          },
        ]}
        resultsText={t('results', { count: visible.length, total: exams.length })}
        showReset={filtered}
        onReset={reset}
        resetLabel={t('reset')}
      />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">{t('noMatches')}</p>
          <p className="text-sm text-muted-foreground">{t('noMatchesHint')}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            {t('reset')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {visible.map((exam) => (
            <ExamCard key={exam.exam_id} exam={exam} courseId={courseId} />
          ))}
        </div>
      )}
    </div>
  )
}
