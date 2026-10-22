'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
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
  DataTableEmptyDescription,
  DataTableEmptyFilteredMessage,
} from '@/components/niko-table/components/data-table-empty-state'
import type { DataTableColumnDef } from '@/components/niko-table/types'
import { IconUsers, IconSettings, IconBook, IconUserOff, IconPlus } from '@tabler/icons-react'
import { CourseStatusActions } from './course-status-actions'
import Link from 'next/link'

interface Course {
  course_id: number
  title: string
  description: string | null
  status: 'draft' | 'published' | 'archived'
  thumbnail_url: string | null
  published_at: string | null
  author_id: string | null
}

interface Author {
  id: string
  full_name: string | null
  avatar_url?: string | null
}

interface CoursesTableProps {
  courses: Course[]
  authorsMap: Map<string, Author>
  lessonCounts: Map<number, number>
  enrollmentCounts: Map<number, number>
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

type CourseStatus = Course['status']

interface CourseRow {
  id: number
  title: string
  description: string
  status: CourseStatus
  thumbnailUrl: string | null
  authorId: string | null
  authorName: string
  authorAvatar: string | null
  lessons: number
  students: number
  publishedAt: string | null
}

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

export function CoursesTable({
  courses,
  authorsMap,
  lessonCounts,
  enrollmentCounts
}: CoursesTableProps) {
  const t = useTranslations('dashboard.admin.courses.table')
  const locale = useLocale()

  const rows = useMemo<CourseRow[]>(
    () =>
      courses.map((course) => {
        const author = course.author_id ? authorsMap.get(course.author_id) : undefined
        return {
          id: course.course_id,
          title: course.title,
          description: course.description ?? '',
          status: course.status,
          thumbnailUrl: course.thumbnail_url,
          authorId: course.author_id,
          authorName: author?.full_name ?? '',
          authorAvatar: author?.avatar_url ?? null,
          lessons: lessonCounts.get(course.course_id) || 0,
          students: enrollmentCounts.get(course.course_id) || 0,
          publishedAt: course.published_at,
        }
      }),
    [courses, authorsMap, lessonCounts, enrollmentCounts],
  )

  const columns = useMemo<DataTableColumnDef<CourseRow>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: sortHeader,
        meta: { label: t('headers.course') },
        size: 300,
        cell: ({ row }) => {
          const course = row.original
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {course.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.thumbnailUrl}
                    alt={course.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <IconBook className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm whitespace-normal line-clamp-1">{course.title}</p>
                <p className="text-xs text-muted-foreground whitespace-normal line-clamp-1">
                  {course.description}
                </p>
              </div>
            </div>
          )
        },
      },
      {
        // Hidden: only feeds the global search (description text).
        id: 'description',
        accessorKey: 'description',
        meta: { label: 'description' },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: 'authorName',
        accessorKey: 'authorName',
        header: sortHeader,
        meta: { label: t('headers.author') },
        cell: ({ row }) => {
          const course = row.original
          return course.authorName ? (
            <div className="flex items-center gap-2">
              <Avatar size="sm">
                {course.authorAvatar && <AvatarImage src={course.authorAvatar} alt={course.authorName} />}
                <AvatarFallback>{getInitials(course.authorName)}</AvatarFallback>
              </Avatar>
              <span className="text-sm whitespace-nowrap">{course.authorName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <IconUserOff className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-xs whitespace-nowrap">{t('unknownAuthor')}</span>
            </div>
          )
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('headers.status') },
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === 'published'
                ? 'default'
                : row.original.status === 'draft'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {t(`statuses.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: 'lessons',
        accessorKey: 'lessons',
        header: sortHeader,
        meta: { label: t('headers.lessons'), variant: 'number' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.lessons}</span>,
      },
      {
        id: 'students',
        accessorKey: 'students',
        header: sortHeader,
        meta: { label: t('headers.students'), variant: 'number' },
        cell: ({ row }) => (
          <div className="flex items-center gap-1 tabular-nums">
            <IconUsers className="h-4 w-4 text-muted-foreground" />
            {row.original.students}
          </div>
        ),
      },
      {
        id: 'publishedAt',
        accessorKey: 'publishedAt',
        header: sortHeader,
        meta: { label: t('headers.publishedDate'), variant: 'date' },
        sortUndefined: 'last',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {row.original.publishedAt ? formatDate(row.original.publishedAt, locale) : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('headers.actions')}</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/dashboard/teacher/courses/${row.original.id}`} />}
            >
              <IconSettings className="h-4 w-4" />
              {t('actions.manage')}
            </Button>
            <CourseStatusActions
              courseId={row.original.id}
              currentStatus={row.original.status}
              courseTitle={row.original.title}
            />
          </div>
        ),
      },
    ],
    [t, locale],
  )

  const statusOptions = (['draft', 'published', 'archived'] as const).map((s) => ({
    value: s,
    label: t(`statuses.${s}`),
  }))

  return (
    <DataTableRoot
      data={rows}
      columns={columns}
      getRowId={(row) => String(row.id)}
      config={{ initialPageSize: 25 }}
      initialState={{ columnVisibility: { description: false } }}
    >
      <DataTableToolbarSection className="mb-4 flex-wrap">
        <DataTableSearchFilter placeholder={t('searchPlaceholder')} className="max-w-md" />
        <DataTableFacetedFilter accessorKey="status" title={t('headers.status')} options={statusOptions} multiple />
        <DataTableClearFilter />
      </DataTableToolbarSection>
      <DataTable>
        <DataTableHeader />
        <DataTableBody>
          <DataTableEmptyBody>
            <DataTableEmptyIcon>
              <IconBook className="h-8 w-8" />
            </DataTableEmptyIcon>
            <DataTableEmptyMessage>
              <DataTableEmptyTitle>{t('empty')}</DataTableEmptyTitle>
              <DataTableEmptyDescription>{t('emptyDesc')}</DataTableEmptyDescription>
              <Button size="sm" className="mt-4 gap-2" nativeButton={false} render={<Link href="/dashboard/admin/courses/new" />}>
                <IconPlus className="h-3.5 w-3.5" />
                {t('createFirst')}
              </Button>
            </DataTableEmptyMessage>
            <DataTableEmptyFilteredMessage>{t('empty')}</DataTableEmptyFilteredMessage>
          </DataTableEmptyBody>
        </DataTableBody>
      </DataTable>
      <DataTablePagination defaultPageSize={25} />
    </DataTableRoot>
  )
}
