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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { IconUsers, IconAlertTriangle, IconChartBar } from '@tabler/icons-react'
import { DataTableRoot } from '@/components/niko-table/core/data-table-root'
import { DataTable } from '@/components/niko-table/core/data-table'
import {
  DataTableHeader,
  DataTableBody,
  DataTableEmptyBody,
} from '@/components/niko-table/core/data-table-structure'
import { DataTableToolbarSection } from '@/components/niko-table/components/data-table-toolbar-section'
import { DataTableSearchFilter } from '@/components/niko-table/components/data-table-search-filter'
import { DataTableFacetedFilter } from '@/components/niko-table/components/data-table-faceted-filter'
import { DataTableClearFilter } from '@/components/niko-table/components/data-table-clear-filter'
import { DataTablePagination } from '@/components/niko-table/components/data-table-pagination'
import { DataTableColumnHeader } from '@/components/niko-table/components/data-table-column-header'
import { DataTableColumnTitle } from '@/components/niko-table/components/data-table-column-title'
import { DataTableColumnSortMenu } from '@/components/niko-table/components/data-table-column-sort'
import {
  DataTableEmptyIcon,
  DataTableEmptyMessage,
  DataTableEmptyTitle,
  DataTableEmptyFilteredMessage,
} from '@/components/niko-table/components/data-table-empty-state'
import type { DataTableColumnDef } from '@/components/niko-table/types'
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

interface Row extends SheetStudent {
  enrollmentId: string | number
  /** Flat, sortable/filterable mirrors of `progress` for the table columns. */
  name: string
  percentage: number
  lessonsDone: number
  exercisesDone: number
  examsDone: number
  lastActivity: number
  status: EngagementStatus
}

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

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
  const tl = useTranslations('dashboard.teacher.manageCourse.studentList')
  const format = useFormatter()

  const [selected, setSelected] = useState<Row | null>(null)

  const rows = useMemo<Row[]>(() => {
    const byUser = new Map(report.students.map((s) => [s.userId, s]))
    const totals = { lessons: lessons.length, exercises: exercises.length, exams: exams.length }
    return enrollments.map((e) => {
      const progress = byUser.get(e.user_id) ?? emptyProgress(e.user_id, totals)
      // Most students sign up without a name, so the email is the only thing
      // that identifies them — show it instead of "Unknown Student".
      const displayName = e.profiles?.full_name || e.email || tl('unknownStudent')
      return {
        enrollmentId: e.enrollment_id,
        userId: e.user_id,
        displayName,
        avatarUrl: e.profiles?.avatar_url ?? null,
        enrolledAt: e.enrollment_date,
        progress,
        name: displayName,
        percentage: progress.overallPercentage,
        lessonsDone: progress.lessonsCompleted,
        exercisesDone: progress.exercisesCompleted,
        examsDone: progress.examsPassed,
        lastActivity: time(progress.lastActivityAt),
        status: progress.status,
      }
    })
  }, [enrollments, report.students, lessons.length, exercises.length, exams.length, tl])

  const generatedAt = report.generatedAt

  const columns = useMemo<DataTableColumnDef<Row>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: sortHeader,
        meta: { label: tl('table.student') },
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center gap-3" data-testid="student-row" data-status={r.status}>
              <Avatar size="sm">
                {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.displayName} />}
                <AvatarFallback>{getInitials(r.displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 max-w-44">
                {/* The name is the keyboard-reachable way into the sheet; the row click is a convenience. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelected(r)
                  }}
                  title={r.displayName}
                  aria-label={tl('table.detailsFor', { name: r.displayName })}
                  className="block max-w-full truncate text-left font-medium hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  {r.displayName}
                </button>
                {r.enrolledAt && (
                  <div className="text-xs text-muted-foreground">
                    {tl('sheet.enrolled', {
                      date: format.dateTime(new Date(r.enrolledAt), { dateStyle: 'medium' }),
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        },
      },
      {
        id: 'percentage',
        accessorKey: 'percentage',
        header: sortHeader,
        meta: { label: tl('table.progress'), variant: 'number' },
        cell: ({ row }) => (
          <ProgressCell
            value={row.original.progress.overallPercentage}
            total={row.original.progress.totalLessons}
            label={tl('table.progress')}
            emptyLabel={tl('noLessons')}
          />
        ),
      },
      {
        id: 'lessonsDone',
        accessorKey: 'lessonsDone',
        header: sortHeader,
        meta: { label: tl('table.lessons'), variant: 'number' },
        cell: ({ row }) => (
          <CountCell done={row.original.progress.lessonsCompleted} total={row.original.progress.totalLessons} />
        ),
      },
      {
        id: 'exercisesDone',
        accessorKey: 'exercisesDone',
        header: sortHeader,
        meta: { label: tl('table.exercises'), variant: 'number' },
        cell: ({ row }) => (
          <CountCell done={row.original.progress.exercisesCompleted} total={row.original.progress.totalExercises} />
        ),
      },
      {
        id: 'examsDone',
        accessorKey: 'examsDone',
        header: sortHeader,
        meta: { label: tl('table.exams'), variant: 'number' },
        cell: ({ row }) => (
          <CountCell done={row.original.progress.examsPassed} total={row.original.progress.totalExams} />
        ),
      },
      {
        id: 'lastActivity',
        accessorKey: 'lastActivity',
        header: sortHeader,
        meta: { label: tl('table.lastActivity'), variant: 'date' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            <ActivityTime
              value={row.original.progress.lastActivityAt}
              now={generatedAt}
              emptyLabel={tl('noActivity')}
            />
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: tl('table.status') },
        cell: ({ row }) => (
          <EngagementBadge
            status={row.original.status}
            label={tl(`status.${row.original.status}`)}
            title={tl(`statusHint.${row.original.status}`, { days: STALL_DAYS })}
          />
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{tl('table.actions')}</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {/* NOTE: IssueCertificateButton also appears in the Certificates tab.
               This is intentional redundancy — teachers may issue from either context. */}
            <IssueCertificateButton
              compact
              courseId={courseId}
              userId={row.original.userId}
              studentName={row.original.displayName}
              existingCertificateId={issuedCertificates.find((c) => c.user_id === row.original.userId)?.id}
            />
          </div>
        ),
      },
    ],
    [tl, format, generatedAt, courseId, issuedCertificates],
  )

  const statusOptions = ENGAGEMENT_STATUSES.map((s) => ({ value: s, label: tl(`status.${s}`) }))

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

      {enrollments.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="student-avg-progress">
          {hasLessons && summary.avgProgress != null
            ? tl('summary.avgProgress', { value: summary.avgProgress })
            : tl('noLessons')}
        </p>
      )}

      <Card>
        <CardContent className="p-4">
          <DataTableRoot
            data={rows}
            columns={columns}
            getRowId={(row) => String(row.enrollmentId)}
            initialState={{ sorting: [{ id: 'lastActivity', desc: true }] }}
            config={{ initialPageSize: 25 }}
          >
            <DataTableToolbarSection className="mb-4 flex-wrap">
              <DataTableSearchFilter placeholder={tl('searchPlaceholder')} className="max-w-md" />
              <DataTableFacetedFilter
                accessorKey="status"
                title={tl('table.status')}
                options={statusOptions}
                multiple
              />
              <DataTableClearFilter enableResetSorting={false} />
            </DataTableToolbarSection>
            <DataTable>
              <DataTableHeader />
              <DataTableBody onRowClick={(row) => setSelected(row as Row)}>
                <DataTableEmptyBody>
                  <DataTableEmptyIcon>
                    <IconUsers className="size-8" />
                  </DataTableEmptyIcon>
                  <DataTableEmptyMessage>
                    <DataTableEmptyTitle>{tl('noStudents')}</DataTableEmptyTitle>
                  </DataTableEmptyMessage>
                  <DataTableEmptyFilteredMessage>{tl('noMatch')}</DataTableEmptyFilteredMessage>
                </DataTableEmptyBody>
              </DataTableBody>
            </DataTable>
            <DataTablePagination defaultPageSize={25} />
          </DataTableRoot>
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
