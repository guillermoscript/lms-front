'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ListToolbar, matchesQuery } from '@/components/student/list-toolbar'

export interface ProgressCourse {
  enrollmentId: number
  courseId: number
  courseTitle: string
  enrollmentDate: string | null
  totalLessons: number
  completedLessons: number
  totalExams: number
  completedExams: number
  percentage: number
  examScores: { title: string; score: number | undefined }[]
  discussionGrades: { title: string; score: number }[]
}

type Status = 'all' | 'notStarted' | 'inProgress' | 'completed'
type Sort = 'recent' | 'progress' | 'title'

function statusOf(percentage: number): Exclude<Status, 'all'> {
  return percentage === 100 ? 'completed' : percentage > 0 ? 'inProgress' : 'notStarted'
}

/** Search / filter / sort for the per-course progress list. */
export function ProgressExplorer({ courses }: { courses: ProgressCourse[] }) {
  const t = useTranslations('dashboard.student.progress')
  const locale = useLocale()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [sort, setSort] = useState<Sort>('recent')

  const statusOptions: { value: Status; label: string }[] = [
    { value: 'all', label: t('list.all') },
    { value: 'notStarted', label: t('notStarted') },
    { value: 'inProgress', label: t('inProgress') },
    { value: 'completed', label: t('completed') },
  ]
  const sortOptions: { value: Sort; label: string }[] = [
    { value: 'recent', label: t('list.recent') },
    { value: 'progress', label: t('list.progress') },
    { value: 'title', label: t('list.title') },
  ]

  const visible = courses
    .map((c, index) => ({ c, index }))
    .filter(
      ({ c }) =>
        matchesQuery(search, locale, c.courseTitle) &&
        (status === 'all' || statusOf(c.percentage) === status)
    )
    .sort((a, b) => {
      if (sort === 'title') return a.c.courseTitle.localeCompare(b.c.courseTitle, locale) || a.index - b.index
      if (sort === 'progress') return b.c.percentage - a.c.percentage || a.index - b.index
      return a.index - b.index // server order is enrollment_date desc
    })
    .map(({ c }) => c)
  const filtered = search !== '' || status !== 'all'

  function reset() {
    setSearch('')
    setStatus('all')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('courseProgress')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchLabel={t('list.search')}
          searchPlaceholder={t('list.searchPlaceholder')}
          selects={[
            {
              id: 'status',
              label: t('list.status'),
              value: status,
              options: statusOptions,
              onChange: (v) => setStatus(v as Status),
            },
            {
              id: 'sort',
              label: t('list.sort'),
              value: sort,
              options: sortOptions,
              onChange: (v) => setSort(v as Sort),
            },
          ]}
          resultsText={t('list.results', { count: visible.length, total: courses.length })}
          showReset={filtered}
          onReset={reset}
          resetLabel={t('list.reset')}
        />

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">{t('list.noMatches')}</p>
            <p className="text-sm text-muted-foreground">{t('list.noMatchesHint')}</p>
            <Button variant="outline" size="sm" onClick={reset}>
              {t('list.reset')}
            </Button>
          </div>
        ) : (
          visible.map((course) => (
            <div key={course.enrollmentId} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold">{course.courseTitle}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {t('lessons', {
                        completed: course.completedLessons,
                        total: course.totalLessons,
                      })}
                    </span>
                    {course.totalExams > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {t('exams', {
                          completed: course.completedExams,
                          total: course.totalExams,
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      course.percentage === 100
                        ? 'default'
                        : course.percentage > 0
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {course.percentage === 100
                      ? t('completed')
                      : course.percentage > 0
                        ? t('inProgress')
                        : t('notStarted')}
                  </Badge>
                  <Link href={`/dashboard/student/courses/${course.courseId}`}>
                    <Button variant="ghost" size="sm">
                      {t('viewCourse')}
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Progress value={course.percentage} className="flex-1" />
                <span className="text-sm font-medium w-12 text-right">{course.percentage}%</span>
              </div>

              {course.examScores.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {course.examScores.map((exam, idx) => (
                    <Badge
                      key={idx}
                      variant={
                        exam.score !== undefined
                          ? exam.score >= 70
                            ? 'default'
                            : 'destructive'
                          : 'outline'
                      }
                      className="text-xs"
                    >
                      {exam.title}
                      {exam.score !== undefined
                        ? ` — ${t('examScore', { score: Math.round(exam.score) })}`
                        : ''}
                    </Badge>
                  ))}
                </div>
              )}

              {course.discussionGrades.length > 0 && (
                <div className="space-y-1.5 pt-1" data-testid="progress-discussion-grades">
                  <p className="text-xs font-medium text-muted-foreground">{t('discussionGrades')}</p>
                  <div className="flex flex-wrap gap-2">
                    {course.discussionGrades.map((grade, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {t('discussionScore', { title: grade.title, score: grade.score })}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
