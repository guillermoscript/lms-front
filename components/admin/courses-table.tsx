'use client'

import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { useParams } from 'next/navigation'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconUsers, IconEye } from '@tabler/icons-react'
import { CourseStatusActions } from './course-status-actions'
import Link from 'next/link'

interface Course {
  course_id: number
  title: string
  description: string | null
  status: 'draft' | 'published' | 'archived'
  thumbnail_url: string | null
  published_at: string | null
  author_id: string
}

interface Author {
  id: string
  full_name: string | null
  email: string
}

interface CoursesTableProps {
  courses: Course[]
  authorsMap: Map<string, Author>
  lessonCounts: Map<number, number>
  enrollmentCounts: Map<number, number>
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
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="pb-3 font-medium">{t('headers.course')}</th>
              <th className="pb-3 font-medium">{t('headers.author')}</th>
              <th className="pb-3 font-medium">{t('headers.status')}</th>
              <th className="pb-3 font-medium">{t('headers.lessons')}</th>
              <th className="pb-3 font-medium">{t('headers.students')}</th>
              <th className="pb-3 font-medium">{t('headers.publishedDate')}</th>
              <th className="pb-3 font-medium">{t('headers.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredCourses.length > 0 ? (
              filteredCourses.map((course) => {
                const author = authorsMap.get(course.author_id)
                const lessonCount = lessonCounts.get(course.course_id) || 0
                const enrollmentCount = enrollmentCounts.get(course.course_id) || 0

                return (
                  <tr key={course.course_id} className="text-sm">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        {course.thumbnail_url && (
                          <img
                            src={course.thumbnail_url}
                            alt={course.title}
                            className="h-12 w-16 rounded object-cover"
                          />
                        )}
                        <div>
                          <p className="font-medium line-clamp-1">{course.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {course.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <div>
                        <p className="font-medium">{author?.full_name || t('unknownAuthor')}</p>
                        <p className="text-xs text-muted-foreground">
                          {author?.email}
                        </p>
                      </div>
                    </td>
                    <td className="py-4">
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
                    </td>
                    <td className="py-4">{lessonCount}</td>
                    <td className="py-4">
                      <div className="flex items-center gap-1">
                        <IconUsers className="h-4 w-4 text-muted-foreground" />
                        {enrollmentCount}
                      </div>
                    </td>
                    <td className="py-4 text-muted-foreground">
                      {course.published_at
                        ? format(new Date(course.published_at), 'MMM d, yyyy', { locale: dateLocale })
                        : '-'}
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col gap-2">
                        <CourseStatusActions
                          courseId={course.course_id}
                          currentStatus={course.status}
                          courseTitle={course.title}
                        />
                        <div className="flex gap-2">
                          <Link href={`/dashboard/student/courses/${course.course_id}`}>
                            <Button variant="ghost" size="sm">
                              <IconEye className="mr-1 h-4 w-4" />
                              {t('actions.view')}
                            </Button>
                          </Link>
                          <Link href={`/dashboard/teacher/courses/${course.course_id}`}>
                            <Button variant="ghost" size="sm">
                              {t('actions.edit')}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
