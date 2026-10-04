'use client'

/**
 * Students tab of the teacher course page (#647): every enrolled student with
 * how far they are, what they have done, when they were last active and
 * whether they are still moving — filterable by engagement status, sortable,
 * with a per-student sheet for the item-by-item view.
 *
 * All data arrives from the server-built `CourseProgressReport`; this file
 * only joins it to the enrolment rows, filters, sorts and pages.
 */

import { useMemo, useState } from 'react'
import { useTranslations, useFormatter } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  IconUsers,
  IconChevronLeft,
  IconChevronRight,
  IconArrowsSort,
  IconSortDescending,
  IconSortAscending,
  IconAlertTriangle,
  IconChartBar,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { IssueCertificateButton } from '@/components/teacher/issue-certificate-button'
import {
  ENGAGEMENT_STATUSES,
  STALL_DAYS,
  type CourseItem,
  type CourseProgressReport,
  type EngagementStatus,
  type StudentProgress,
} from '@/lib/analytics/student-progress'
import { EngagementBadge, ProgressCell, CountCell, ActivityTime } from './student-progress-cells'
import { StudentProgressSheet, type SheetStudent } from './student-progress-sheet'
import { LessonFunnel } from './lesson-funnel'

const PAGE_SIZE = 10

interface StudentEnrollment {
  enrollment_id: string | number
  user_id: string
  enrollment_date: string | null
  status: string | null
  profiles?: { full_name?: string | null; avatar_url?: string | null } | null
  /** Auth email, resolved server-side when the profile has no full_name. */
  email?: string | null
}

interface IssuedCertificate {
  id?: string
  user_id: string
}

interface CourseStudentsTableProps {
  enrollments: StudentEnrollment[]
  issuedCertificates: IssuedCertificate[]
  courseId: number
  report: CourseProgressReport
  lessons: CourseItem[]
  exercises: CourseItem[]
  exams: CourseItem[]
}

type Filter = 'all' | EngagementStatus
type SortKey = 'lastActivity' | 'progress' | 'name'

interface Row extends SheetStudent {
  enrollmentId: string | number
}

function getInitials(name: string | null | undefined) {
  if (!name) return ''
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

/** A student the report has no row for (should not happen) reads as not started, never as 0% of something. */
function emptyProgress(userId: string, totals: { lessons: number; exercises: number; exams: number }): StudentProgress {
  return {
    userId,
    overallPercentage: 0,
    lessonsCompleted: 0,
    totalLessons: totals.lessons,
    completedLessons: [],
    exercisesCompleted: 0,
    totalExercises: totals.exercises,
    completedExerciseIds: [],
    examsPassed: 0,
    totalExams: totals.exams,
    exams: [],
    lastActivityAt: null,
    status: 'not_started',
    nextLessonId: null,
  }
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY)

export function CourseStudentsTable({
  enrollments,
  issuedCertificates,
  courseId,
  report,
  lessons,
  exercises,
  exams,
}: CourseStudentsTableProps) {
  const t = useTranslations('dashboard.teacher.manageCourse')
  const tl = useTranslations('dashboard.teacher.manageCourse.studentList')
  const format = useFormatter()

  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('lastActivity')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Row | null>(null)

  const rows = useMemo<Row[]>(() => {
    const byUser = new Map(report.students.map((s) => [s.userId, s]))
    const totals = { lessons: lessons.length, exercises: exercises.length, exams: exams.length }
    return enrollments.map((e) => ({
      enrollmentId: e.enrollment_id,
      userId: e.user_id,
      // Most students sign up without a name, so the email is the only thing
      // that identifies them — show it instead of "Unknown Student".
      displayName: e.profiles?.full_name || e.email || tl('unknownStudent'),
      avatarUrl: e.profiles?.avatar_url ?? null,
      enrolledAt: e.enrollment_date,
      progress: byUser.get(e.user_id) ?? emptyProgress(e.user_id, totals),
    }))
  }, [enrollments, report.students, lessons.length, exercises.length, exams.length, tl])

  const visible = useMemo(() => {
    const filtered = filter === 'all' ? rows : rows.filter((r) => r.progress.status === filter)
    const dir = sortAsc ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'progress') {
        cmp = a.progress.overallPercentage - b.progress.overallPercentage
      } else if (sortKey === 'lastActivity') {
        cmp = time(a.progress.lastActivityAt) - time(b.progress.lastActivityAt)
      } else {
        cmp = -a.displayName.localeCompare(b.displayName)
      }
      return cmp * dir || a.displayName.localeCompare(b.displayName)
    })
  }, [rows, filter, sortKey, sortAsc])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paginated = visible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v)
    } else {
      setSortKey(key)
      setSortAsc(key === 'name')
    }
    setPage(0)
  }

  const applyFilter = (next: Filter) => {
    setFilter(next)
    setPage(0)
  }

  const { summary } = report
  const hasLessons = lessons.length > 0

  return (
    <div className="space-y-4">
      {report.warnings.length > 0 && (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>{tl('warnings.title')}</AlertTitle>
          <AlertDescription>
            <p>{tl('warnings.desc')}</p>
            <ul className="mt-1 list-disc pl-4">
              {report.warnings.map((w) => (
                <li key={w} className="font-mono text-xs">
                  {w}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary + status filter. The counts ARE the filter: one row, no duplicate widgets. */}
      {enrollments.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label={tl('filter.label')}
            className="flex flex-wrap items-center gap-1.5"
            data-testid="student-status-filter"
          >
            <FilterChip active={filter === 'all'} onClick={() => applyFilter('all')} count={summary.total}>
              {tl('filter.all')}
            </FilterChip>
            {ENGAGEMENT_STATUSES.map((s) => (
              <FilterChip
                key={s}
                active={filter === s}
                onClick={() => applyFilter(s)}
                count={summary.byStatus[s]}
                title={tl(`statusHint.${s}`, { days: STALL_DAYS })}
                status={s}
              >
                {tl(`status.${s}`)}
              </FilterChip>
            ))}
          </div>
          <p className="text-sm text-muted-foreground" data-testid="student-avg-progress">
            {hasLessons && summary.avgProgress != null
              ? tl('summary.avgProgress', { value: summary.avgProgress })
              : tl('noLessons')}
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3">
                    <SortButton onClick={() => toggleSort('name')} label={tl('table.student')}>
                      <SortIcon column="name" sortKey={sortKey} sortAsc={sortAsc} />
                    </SortButton>
                  </TableHead>
                  <TableHead className="px-3">
                    <SortButton onClick={() => toggleSort('progress')} label={tl('table.progress')}>
                      <SortIcon column="progress" sortKey={sortKey} sortAsc={sortAsc} />
                    </SortButton>
                  </TableHead>
                  <TableHead className="px-3 text-right whitespace-nowrap">{tl('table.lessons')}</TableHead>
                  <TableHead className="px-3 text-right whitespace-nowrap">{tl('table.exercises')}</TableHead>
                  <TableHead className="px-3 text-right whitespace-nowrap">{tl('table.exams')}</TableHead>
                  <TableHead className="px-3">
                    <SortButton onClick={() => toggleSort('lastActivity')} label={tl('table.lastActivity')}>
                      <SortIcon column="lastActivity" sortKey={sortKey} sortAsc={sortAsc} />
                    </SortButton>
                  </TableHead>
                  <TableHead className="px-3">{tl('table.status')}</TableHead>
                  <TableHead className="px-3 text-right">{tl('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length > 0 ? (
                  paginated.map((row) => {
                    const p = row.progress
                    return (
                      <TableRow
                        key={row.enrollmentId}
                        data-testid="student-row"
                        data-status={p.status}
                        className="cursor-pointer"
                        onClick={() => setSelected(row)}
                      >
                        <TableCell className="px-3">
                          <div className="flex items-center gap-3">
                            <Avatar size="sm">
                              {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt={row.displayName} />}
                              <AvatarFallback>{getInitials(row.displayName)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 max-w-44">
                              {/* The name is the keyboard-reachable way into the sheet; the row click is a convenience. */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelected(row)
                                }}
                                title={row.displayName}
                                aria-label={tl('table.detailsFor', { name: row.displayName })}
                                className="block max-w-full truncate text-left font-medium hover:underline focus-visible:outline-none focus-visible:underline"
                              >
                                {row.displayName}
                              </button>
                              {row.enrolledAt && (
                                <div className="text-xs text-muted-foreground">
                                  {tl('sheet.enrolled', {
                                    date: format.dateTime(new Date(row.enrolledAt), { dateStyle: 'medium' }),
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-3">
                          <ProgressCell
                            value={p.overallPercentage}
                            total={p.totalLessons}
                            label={tl('table.progress')}
                            emptyLabel={tl('noLessons')}
                          />
                        </TableCell>
                        <TableCell className="px-3 text-right">
                          <CountCell done={p.lessonsCompleted} total={p.totalLessons} />
                        </TableCell>
                        <TableCell className="px-3 text-right">
                          <CountCell done={p.exercisesCompleted} total={p.totalExercises} />
                        </TableCell>
                        <TableCell className="px-3 text-right">
                          <CountCell done={p.examsPassed} total={p.totalExams} />
                        </TableCell>
                        <TableCell className="px-3 whitespace-nowrap text-muted-foreground">
                          <ActivityTime
                            value={p.lastActivityAt}
                            now={report.generatedAt}
                            emptyLabel={tl('noActivity')}
                          />
                        </TableCell>
                        <TableCell className="px-3">
                          <EngagementBadge
                            status={p.status}
                            label={tl(`status.${p.status}`)}
                            title={tl(`statusHint.${p.status}`, { days: STALL_DAYS })}
                          />
                        </TableCell>
                        <TableCell className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {/* NOTE: IssueCertificateButton also appears in the Certificates tab.
                               This is intentional redundancy — teachers may issue from either context. */}
                            <IssueCertificateButton
                              compact
                              courseId={courseId}
                              userId={row.userId}
                              studentName={row.displayName}
                              existingCertificateId={
                                issuedCertificates.find((c) => c.user_id === row.userId)?.id
                              }
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <IconUsers className="size-8" />
                        <p>{enrollments.length === 0 ? tl('noStudents') : tl('noMatch')}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm tabular-nums text-muted-foreground">
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, visible.length)} / {visible.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  aria-label={t('studentList.pagination.prev')}
                >
                  <IconChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  aria-label={t('studentList.pagination.next')}
                >
                  <IconChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {enrollments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IconChartBar className="size-4 text-muted-foreground" aria-hidden />
              {tl('funnel.title')}
            </CardTitle>
            <CardDescription>{tl('funnel.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <LessonFunnel
              steps={report.lessonFunnel}
              total={summary.total}
              labels={{
                completedBy: (count, total) => tl('funnel.completedBy', { count, total }),
                meter: (title) => tl('funnel.meter', { title }),
                empty: tl('noLessons'),
              }}
            />
          </CardContent>
        </Card>
      )}

      <StudentProgressSheet
        student={selected}
        onClose={() => setSelected(null)}
        lessons={lessons}
        exercises={exercises}
        exams={exams}
        generatedAt={report.generatedAt}
        courseId={courseId}
        existingCertificateId={
          selected ? issuedCertificates.find((c) => c.user_id === selected.userId)?.id : undefined
        }
      />
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  count,
  title,
  status,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  title?: string
  status?: EngagementStatus
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      data-status={status ?? 'all'}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
      <span className={cn('tabular-nums', active ? 'opacity-80' : 'opacity-70')}>{count}</span>
    </button>
  )
}

function SortIcon({ column, sortKey, sortAsc }: { column: SortKey; sortKey: SortKey; sortAsc: boolean }) {
  if (sortKey !== column) return <IconArrowsSort className="size-3.5 opacity-40" aria-hidden />
  return sortAsc ? (
    <IconSortAscending className="size-3.5" aria-hidden />
  ) : (
    <IconSortDescending className="size-3.5" aria-hidden />
  )
}

function SortButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      {children}
    </button>
  )
}
