'use client'

import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { useParams } from 'next/navigation'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconUsers, IconSettings, IconBook, IconUserOff } from '@tabler/icons-react'
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

export function CoursesTable({
  courses,
  authorsMap,
  lessonCounts,
  enrollmentCounts
}: CoursesTableProps) {
  const t = useTranslations('dashboard.admin.courses.table')
  const { locale } = useParams()
  const dateLocale = locale === 'es' ? es : enUS
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Filter courses based on search and status
  const filteredCourses = courses.filter(course => {
    const matchesSearch = searchQuery === '' ||
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === 'all' || course.status === statusFilter

    return matchesSearch && matchesStatus
  })

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
          aria-label={t('searchPlaceholder')}
        />
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value || 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('filterStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatuses')}</SelectItem>
            <SelectItem value="draft">{t('statuses.draft')}</SelectItem>
            <SelectItem value="published">{t('statuses.published')}</SelectItem>
            <SelectItem value="archived">{t('statuses.archived')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[240px] py-3">{t('headers.course')}</TableHead>
              <TableHead className="py-3">{t('headers.author')}</TableHead>
              <TableHead className="py-3">{t('headers.status')}</TableHead>
              <TableHead className="py-3 text-right">{t('headers.lessons')}</TableHead>
              <TableHead className="py-3 text-right">{t('headers.students')}</TableHead>
              <TableHead className="py-3">{t('headers.publishedDate')}</TableHead>
              <TableHead className="py-3 text-right">{t('headers.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCourses.length > 0 ? (
              filteredCourses.map((course) => {
                const author = course.author_id ? authorsMap.get(course.author_id) : undefined
                const lessonCount = lessonCounts.get(course.course_id) || 0
                const enrollmentCount = enrollmentCounts.get(course.course_id) || 0

                return (
                  <TableRow key={course.course_id}>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                          {course.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={course.thumbnail_url}
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
                    </TableCell>
                    <TableCell className="py-3">
                      {author?.full_name ? (
                        <div className="flex items-center gap-2">
                          <Avatar size="sm">
                            {author.avatar_url && <AvatarImage src={author.avatar_url} alt={author.full_name} />}
                            <AvatarFallback>{getInitials(author.full_name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm whitespace-nowrap">{author.full_name}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <IconUserOff className="h-4 w-4" strokeWidth={1.75} />
                          <span className="text-xs whitespace-nowrap">{t('unknownAuthor')}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge
                        variant={
                          course.status === 'published'
                            ? 'default'
                            : course.status === 'draft'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {t(`statuses.${course.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-right tabular-nums">{lessonCount}</TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1 tabular-nums">
                        <IconUsers className="h-4 w-4 text-muted-foreground" />
                        {enrollmentCount}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 whitespace-nowrap text-muted-foreground">
                      {course.published_at
                        ? format(new Date(course.published_at), 'MMM d, yyyy', { locale: dateLocale })
                        : '—'}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/dashboard/teacher/courses/${course.course_id}`}>
                          <Button variant="outline" size="sm">
                            <IconSettings className="h-4 w-4" />
                            {t('actions.manage')}
                          </Button>
                        </Link>
                        <CourseStatusActions
                          courseId={course.course_id}
                          currentStatus={course.status}
                          courseTitle={course.title}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
