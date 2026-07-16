'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { IconUsers, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { IssueCertificateButton } from '@/components/teacher/issue-certificate-button'

const PAGE_SIZE = 10

interface StudentEnrollment {
  enrollment_id: string | number
  user_id: string
  enrollment_date: string
  status: string
  profiles?: { full_name?: string | null; avatar_url?: string | null } | null
}

interface IssuedCertificate {
  id?: string
  user_id: string
}

interface CourseStudentsTableProps {
  enrollments: StudentEnrollment[]
  issuedCertificates: IssuedCertificate[]
  courseId: number
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

export function CourseStudentsTable({ enrollments, issuedCertificates, courseId }: CourseStudentsTableProps) {
  const t = useTranslations('dashboard.teacher.manageCourse')
  const [page, setPage] = useState(0)

  const totalPages = Math.ceil(enrollments.length / PAGE_SIZE)
  const paginatedEnrollments = enrollments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">{t('studentList.table.student')}</TableHead>
              <TableHead className="px-4">{t('studentList.table.date')}</TableHead>
              <TableHead className="px-4">{t('studentList.table.status')}</TableHead>
              <TableHead className="px-4 text-right">{t('studentList.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedEnrollments.length > 0 ? (
              paginatedEnrollments.map((enrollment) => (
                <TableRow key={enrollment.enrollment_id}>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-3">
                      <Avatar size="sm">
                        {enrollment.profiles?.avatar_url && (
                          <AvatarImage src={enrollment.profiles.avatar_url} alt={enrollment.profiles?.full_name || ''} />
                        )}
                        <AvatarFallback>{getInitials(enrollment.profiles?.full_name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{enrollment.profiles?.full_name || t('studentList.unknownStudent')}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 whitespace-nowrap text-muted-foreground">
                    {new Date(enrollment.enrollment_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="px-4">
                    <Badge variant="outline" className="capitalize">
                      {t(`status.${enrollment.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    {/* NOTE: IssueCertificateButton also appears in the Certificates tab.
                       This is intentional redundancy — teachers may issue from either context.
                       The Students tab is for quick per-student actions; the Certificates tab
                       provides the full certificate management view with template preview. */}
                    <IssueCertificateButton
                      courseId={courseId}
                      userId={enrollment.user_id}
                      studentName={enrollment.profiles?.full_name || t('studentList.unknownStudent')}
                      existingCertificateId={issuedCertificates.find((c) => c.user_id === enrollment.user_id)?.id}
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <IconUsers className="h-8 w-8" />
                    <p>{t('studentList.noStudents')}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-muted-foreground tabular-nums">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, enrollments.length)} / {enrollments.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 0}
              >
                <IconChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages - 1}
              >
                <IconChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
