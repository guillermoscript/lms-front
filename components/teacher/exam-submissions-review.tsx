'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@/lib/format-date'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  IconCheck,
  IconClock,
  IconRobot,
  IconUser,
  IconAlertCircle,
  IconExternalLink,
} from '@tabler/icons-react'
import Link from 'next/link'

interface SubmissionRow {
  id: number
  student: string
  email: string
  status: string
  aiScore: number | null
  finalScore: number | null
  submittedAt: string
}

interface ExamSubmission {
  id: number
  status: string
  ai_score?: number | null
  final_score?: number | null
  submitted_at: string
  profiles?: { full_name?: string | null; email?: string | null } | null
}

interface ExamSubmissionsReviewProps {
  courseId: number
  examId: number
  submissions: ExamSubmission[]
  examTitle?: string
}

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

export function ExamSubmissionsReview({
  courseId,
  examId,
  submissions,
  examTitle,
}: ExamSubmissionsReviewProps) {
  const t = useTranslations('dashboard.teacher.examSubmissionsReview')
  const locale = useLocale()

  const stats = {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === 'pending').length,
    aiReviewed: submissions.filter((s) => s.status === 'ai_reviewed').length,
    graded: submissions.filter((s) => s.status === 'teacher_reviewed').length,
  }

  const rows = useMemo<SubmissionRow[]>(
    () =>
      submissions.map((s) => ({
        id: s.id,
        student: s.profiles?.full_name || t('table.unknownStudent'),
        email: s.profiles?.email ?? '',
        status: s.status,
        aiScore: s.ai_score ?? null,
        finalScore: s.final_score ?? null,
        submittedAt: s.submitted_at,
      })),
    [submissions, t],
  )

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="flex w-fit items-center gap-1">
            <IconClock className="h-3 w-3" />
            {t('status.pending')}
          </Badge>
        )
      case 'ai_reviewed':
        return (
          <Badge
            variant="secondary"
            className="flex w-fit items-center gap-1 bg-brand-tint text-brand-text border-primary/20"
          >
            <IconRobot className="h-3 w-3" />
            {t('status.aiReviewed')}
          </Badge>
        )
      case 'teacher_reviewed':
        return (
          <Badge
            variant="secondary"
            className="flex w-fit items-center gap-1 bg-success/10 text-success border-success/30"
          >
            <IconCheck className="h-3 w-3" />
            {t('status.graded')}
          </Badge>
        )
      case 'needs_attention':
        return (
          <Badge
            variant="destructive"
            className="flex w-fit items-center gap-1"
          >
            <IconAlertCircle className="h-3 w-3" />
            {t('status.needsAttention')}
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const columns = useMemo<DataTableColumnDef<SubmissionRow>[]>(
    () => [
      {
        id: 'student',
        accessorKey: 'student',
        header: sortHeader,
        meta: { label: t('table.student') },
        cell: ({ row }) => (
          <>
            <div className="font-medium">{row.original.student}</div>
            <div className="text-xs text-muted-foreground">{row.original.email}</div>
          </>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('table.status') },
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        id: 'aiScore',
        accessorKey: 'aiScore',
        header: sortHeader,
        meta: { label: t('table.aiScore'), variant: 'number' },
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.aiScore !== null ? `${Math.round(row.original.aiScore * 10) / 10}%` : '—'}
          </div>
        ),
      },
      {
        id: 'finalScore',
        accessorKey: 'finalScore',
        header: sortHeader,
        meta: { label: t('table.finalScore'), variant: 'number' },
        cell: ({ row }) => (
          <div className="text-right font-bold">
            {row.original.finalScore !== null ? `${Math.round(row.original.finalScore * 10) / 10}%` : '—'}
          </div>
        ),
      },
      {
        id: 'submittedAt',
        accessorKey: 'submittedAt',
        header: sortHeader,
        meta: { label: t('table.submitted'), variant: 'date' },
        cell: ({ row }) => (
          <div className="text-right text-muted-foreground">
            {formatDate(row.original.submittedAt, locale)}
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('table.reviewButton')}</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions/${row.original.id}`} />}
            >
              {t('table.reviewButton')}
              <IconExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, courseId, examId],
  )

  const statusOptions = [
    { value: 'pending', label: t('status.pending') },
    { value: 'ai_reviewed', label: t('status.aiReviewed') },
    { value: 'teacher_reviewed', label: t('status.graded') },
    { value: 'needs_attention', label: t('status.needsAttention') },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.total')}</CardTitle>
            <IconUser className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.pending')}</CardTitle>
            <IconClock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.aiReviewed')}</CardTitle>
            <IconRobot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.aiReviewed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.graded')}</CardTitle>
            <IconCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.graded}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{examTitle || t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTableRoot
            data={rows}
            columns={columns}
            getRowId={(row) => String(row.id)}
            config={{ initialPageSize: 25 }}
          >
            <DataTableToolbarSection className="mb-4 flex-wrap">
              <DataTableSearchFilter placeholder={t('table.searchPlaceholder')} className="max-w-md" />
              <DataTableFacetedFilter accessorKey="status" title={t('table.status')} options={statusOptions} multiple />
              <DataTableClearFilter />
            </DataTableToolbarSection>
            <DataTable>
              <DataTableHeader />
              <DataTableBody>
                <DataTableEmptyBody>
                  <DataTableEmptyIcon>
                    <IconUser className="h-8 w-8" />
                  </DataTableEmptyIcon>
                  <DataTableEmptyMessage>
                    <DataTableEmptyTitle>{t('table.noSubmissions')}</DataTableEmptyTitle>
                  </DataTableEmptyMessage>
                  <DataTableEmptyFilteredMessage>{t('table.noSubmissions')}</DataTableEmptyFilteredMessage>
                </DataTableEmptyBody>
              </DataTableBody>
            </DataTable>
            <DataTablePagination defaultPageSize={25} />
          </DataTableRoot>
        </CardContent>
      </Card>
    </div>
  )
}
