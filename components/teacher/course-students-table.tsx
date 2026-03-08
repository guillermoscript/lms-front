'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { IconUsers, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { IssueCertificateButton } from '@/components/teacher/issue-certificate-button'

const PAGE_SIZE = 10

interface CourseStudentsTableProps {
  enrollments: any[]
  issuedCertificates: any[]
  courseId: number
}

export function CourseStudentsTable({ enrollments, issuedCertificates, courseId }: CourseStudentsTableProps) {
  const t = useTranslations('dashboard.teacher.manageCourse')
  const [page, setPage] = useState(0)

  const totalPages = Math.ceil(enrollments.length / PAGE_SIZE)
  const paginatedEnrollments = enrollments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t('studentList.table.student')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('studentList.table.date')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('studentList.table.status')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('studentList.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEnrollments.length > 0 ? (
                paginatedEnrollments.map((enrollment: any) => (
                  <tr key={enrollment.enrollment_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center overflow-hidden border">
                          {enrollment.profiles?.avatar_url ? (
                            <img src={enrollment.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <IconUsers className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <span className="font-medium">{enrollment.profiles?.full_name || t('studentList.unknownStudent')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(enrollment.enrollment_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">
                        {t(`status.${enrollment.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* NOTE: IssueCertificateButton also appears in the Certificates tab.
                         This is intentional redundancy — teachers may issue from either context.
                         The Students tab is for quick per-student actions; the Certificates tab
                         provides the full certificate management view with template preview. */}
                      <IssueCertificateButton
                        courseId={courseId}
                        userId={enrollment.user_id}
                        studentName={enrollment.profiles?.full_name || t('studentList.unknownStudent')}
                        existingCertificateId={issuedCertificates.find((c: any) => c.user_id === enrollment.user_id)?.id}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    {t('studentList.noStudents')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
