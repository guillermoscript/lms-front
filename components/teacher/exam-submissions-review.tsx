'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { cn } from '@/lib/utils'

interface ExamSubmissionsReviewProps {
  courseId: number
  examId: number
  submissions: any[]
  examTitle?: string
}

export function ExamSubmissionsReview({
  courseId,
  examId,
  submissions,
  examTitle,
}: ExamSubmissionsReviewProps) {
  const t = useTranslations('dashboard.teacher.examSubmissionsReview')
  const [activeTab, setActiveTab] = useState('all')

  const stats = {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === 'pending').length,
    aiReviewed: submissions.filter((s) => s.status === 'ai_reviewed').length,
    graded: submissions.filter((s) => s.status === 'teacher_reviewed').length,
  }

  const filteredSubmissions =
    activeTab === 'all'
      ? submissions
      : submissions.filter((s) => {
        if (activeTab === 'pending') return s.status === 'pending'
        if (activeTab === 'ai_reviewed') return s.status === 'ai_reviewed'
        if (activeTab === 'graded') return s.status === 'teacher_reviewed'
        return true
      })

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
            className="flex w-fit items-center gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/40"
          >
            <IconRobot className="h-3 w-3" />
            {t('status.aiReviewed')}
          </Badge>
        )
      case 'teacher_reviewed':
        return (
          <Badge
            variant="secondary"
            className="flex w-fit items-center gap-1 bg-green-100 text-green-700 hover:bg-green-100/80 dark:bg-green-950/50 dark:text-green-300 dark:hover:bg-green-950/40"
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
            <IconClock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.aiReviewed')}</CardTitle>
            <IconRobot className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.aiReviewed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.graded')}</CardTitle>
            <IconCheck className="h-4 w-4 text-green-500" />
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
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
              <TabsTrigger value="pending">{t('tabs.pending')}</TabsTrigger>
              <TabsTrigger value="ai_reviewed">{t('tabs.aiReviewed')}</TabsTrigger>
              <TabsTrigger value="graded">{t('tabs.graded')}</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('table.student')}</TableHead>
                    <TableHead>{t('table.status')}</TableHead>
                    <TableHead className="text-right">{t('table.aiScore')}</TableHead>
                    <TableHead className="text-right">{t('table.finalScore')}</TableHead>
                    <TableHead className="text-right">{t('table.submitted')}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {t('table.noSubmissions')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSubmissions.map((submission) => (
                      <TableRow key={submission.id}>
                        <TableCell>
                          <div className="font-medium">
                            {submission.profiles?.full_name || t('table.unknownStudent')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {submission.profiles?.email}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(submission.status)}</TableCell>
                        <TableCell className="text-right">
                          {submission.ai_score !== null
                            ? `${submission.ai_score}%`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {submission.final_score !== null
                            ? `${submission.final_score}%`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {new Date(submission.submitted_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions/${submission.id}`}>
                            <Button variant="ghost" size="sm">
                              {t('table.reviewButton')}
                              <IconExternalLink className="ml-2 h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
