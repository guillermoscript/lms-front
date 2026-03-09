'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { IconDownload } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ExportData {
  revenueData: Array<{ date: string; revenue: number; transactions: number }>
  userGrowthData: Array<{ date: string; newUsers: number; totalUsers: number }>
  coursePopularityData: Array<{
    courseId: number
    title: string
    enrollments: number
    completionRate: number
  }>
  metrics: {
    totalRevenue: number
    totalUsers: number
    totalEnrollments: number
    activeStudents: number
    averageCompletionRate: number
  }
}

interface ExportButtonProps {
  data: ExportData
  period: string
}

export function ExportButton({ data, period }: ExportButtonProps) {
  const t = useTranslations('dashboard.admin.analytics.exportOptions')
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportRevenue = () => {
    let csv = 'Date,Revenue,Transactions\n'
    data.revenueData.forEach((row) => {
      csv += `${row.date},${row.revenue.toFixed(2)},${row.transactions}\n`
    })
    downloadCSV(csv, `revenue-report-${period}-days.csv`)
  }

  const exportUserGrowth = () => {
    let csv = 'Date,New Users,Total Users\n'
    data.userGrowthData.forEach((row) => {
      csv += `${row.date},${row.newUsers},${row.totalUsers}\n`
    })
    downloadCSV(csv, `user-growth-${period}-days.csv`)
  }

  const exportCoursePopularity = () => {
    let csv = 'Course ID,Course Title,Enrollments,Completion Rate\n'
    data.coursePopularityData.forEach((row) => {
      csv += `${row.courseId},"${row.title}",${row.enrollments},${row.completionRate.toFixed(2)}%\n`
    })
    downloadCSV(csv, `course-popularity-${period}-days.csv`)
  }

  const exportSummary = () => {
    let csv = 'Metric,Value\n'
    csv += `Total Revenue,$${data.metrics.totalRevenue.toFixed(2)}\n`
    csv += `Total Users,${data.metrics.totalUsers}\n`
    csv += `Total Enrollments,${data.metrics.totalEnrollments}\n`
    csv += `Active Students (30 days),${data.metrics.activeStudents}\n`
    csv += `Average Completion Rate,${data.metrics.averageCompletionRate.toFixed(2)}%\n`
    downloadCSV(csv, `analytics-summary-${period}-days.csv`)
  }

  const exportAll = () => {
    let csv = '=== ANALYTICS SUMMARY ===\n'
    csv += 'Metric,Value\n'
    csv += `Total Revenue,$${data.metrics.totalRevenue.toFixed(2)}\n`
    csv += `Total Users,${data.metrics.totalUsers}\n`
    csv += `Total Enrollments,${data.metrics.totalEnrollments}\n`
    csv += `Active Students (30 days),${data.metrics.activeStudents}\n`
    csv += `Average Completion Rate,${data.metrics.averageCompletionRate.toFixed(2)}%\n`
    csv += '\n=== REVENUE DATA ===\n'
    csv += 'Date,Revenue,Transactions\n'
    data.revenueData.forEach((row) => {
      csv += `${row.date},${row.revenue.toFixed(2)},${row.transactions}\n`
    })
    csv += '\n=== USER GROWTH DATA ===\n'
    csv += 'Date,New Users,Total Users\n'
    data.userGrowthData.forEach((row) => {
      csv += `${row.date},${row.newUsers},${row.totalUsers}\n`
    })
    csv += '\n=== COURSE POPULARITY DATA ===\n'
    csv += 'Course ID,Course Title,Enrollments,Completion Rate\n'
    data.coursePopularityData.forEach((row) => {
      csv += `${row.courseId},"${row.title}",${row.enrollments},${row.completionRate.toFixed(2)}%\n`
    })
    downloadCSV(csv, `complete-analytics-report-${period}-days.csv`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <IconDownload className="h-4 w-4" />
            {t('button')}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAll}>{t('all')}</DropdownMenuItem>
        <DropdownMenuItem onClick={exportSummary}>{t('summary')}</DropdownMenuItem>
        <DropdownMenuItem onClick={exportRevenue}>{t('revenue')}</DropdownMenuItem>
        <DropdownMenuItem onClick={exportUserGrowth}>
          {t('userGrowth')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportCoursePopularity}>
          {t('coursePopularity')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
