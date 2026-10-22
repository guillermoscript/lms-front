'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@/lib/format-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { IconCertificate, IconSettings } from '@tabler/icons-react'

function getInitials(name: string | null | undefined) {
  if (!name) return ''
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export interface EnrollmentRow {
  id: number | string
  courseId: number | string
  studentName: string | null
  email: string
  avatarUrl: string | null
  courseTitle: string | null
  status: string
  enrolledAt: string
}

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

export function EnrollmentsTable({ enrollments }: { enrollments: EnrollmentRow[] }) {
  const t = useTranslations('dashboard.admin.enrollments')
  const locale = useLocale()

  const rows = useMemo(
    () =>
      enrollments.map((e) => ({
        ...e,
        studentName: e.studentName || t('table.unknown'),
        courseTitle: e.courseTitle || t('table.unknownCourse'),
      })),
    [enrollments, t],
  )

  const columns = useMemo<DataTableColumnDef<EnrollmentRow>[]>(
    () => [
      {
        id: 'studentName',
        accessorKey: 'studentName',
        header: sortHeader,
        meta: { label: t('table.headers.student') },
        size: 260,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              {row.original.avatarUrl && (
                <AvatarImage src={row.original.avatarUrl} alt={row.original.studentName || ''} />
              )}
              <AvatarFallback>{getInitials(row.original.studentName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium whitespace-nowrap">{row.original.studentName}</p>
              <p className="text-[11px] text-muted-foreground">{row.original.email || '—'}</p>
            </div>
          </div>
        ),
      },
      {
        // Hidden: only here so the search box also matches e-mail addresses.
        id: 'email',
        accessorKey: 'email',
        meta: { label: 'Email' },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: 'courseTitle',
        accessorKey: 'courseTitle',
        header: sortHeader,
        meta: { label: t('table.headers.course') },
        cell: ({ row }) => <p className="font-medium line-clamp-1">{row.original.courseTitle}</p>,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('table.headers.status') },
        cell: ({ row }) => {
          const status = row.original.status
          return (
            <Badge
              variant={status === 'active' ? 'default' : status === 'completed' ? 'secondary' : 'outline'}
              className={`text-[10px] ${status === 'active' ? 'bg-success/10 text-success border-success/30' : ''}`}
            >
              {status === 'active' ? t('stats.active') : status === 'completed' ? t('stats.completed') : t('table.statusDisabled')}
            </Badge>
          )
        },
      },
      {
        id: 'enrolledAt',
        accessorKey: 'enrolledAt',
        header: sortHeader,
        meta: { label: t('table.headers.enrolled'), variant: 'date' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {formatDate(row.original.enrolledAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('table.headers.actions')}</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/dashboard/teacher/courses/${row.original.courseId}`} />}
            >
              <IconSettings className="h-4 w-4" />
              {t('table.viewCourse')}
            </Button>
          </div>
        ),
      },
    ],
    [t, locale],
  )

  const statusOptions = [
    { value: 'active', label: t('stats.active') },
    { value: 'completed', label: t('stats.completed') },
    { value: 'disabled', label: t('table.statusDisabled') },
  ]

  const courseOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.courseTitle))]
        .sort((a, b) => a.localeCompare(b))
        .map((title) => ({ value: title, label: title })),
    [rows],
  )

  return (
    <DataTableRoot
      data={rows}
      columns={columns}
      getRowId={(row) => String(row.id)}
      config={{ initialPageSize: 25 }}
      initialState={{ columnVisibility: { email: false } }}
    >
      <DataTableToolbarSection className="mb-4 flex-wrap">
        <DataTableSearchFilter placeholder={t('table.searchPlaceholder')} className="max-w-md" />
        <DataTableFacetedFilter accessorKey="status" title={t('table.headers.status')} options={statusOptions} multiple />
        <DataTableFacetedFilter accessorKey="courseTitle" title={t('table.headers.course')} options={courseOptions} multiple />
        <DataTableClearFilter />
      </DataTableToolbarSection>
      <DataTable>
        <DataTableHeader />
        <DataTableBody>
          <DataTableEmptyBody>
            <DataTableEmptyIcon>
              <IconCertificate className="h-8 w-8" />
            </DataTableEmptyIcon>
            <DataTableEmptyMessage>
              <DataTableEmptyTitle>{t('table.empty')}</DataTableEmptyTitle>
            </DataTableEmptyMessage>
            <DataTableEmptyFilteredMessage>{t('table.empty')}</DataTableEmptyFilteredMessage>
          </DataTableEmptyBody>
        </DataTableBody>
      </DataTable>
      <DataTablePagination defaultPageSize={25} />
    </DataTableRoot>
  )
}
