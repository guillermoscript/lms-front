'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft, IconEye } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface PreviewBannerProps {
  courseId: string
}

export function PreviewBanner({ courseId }: PreviewBannerProps) {
  const t = useTranslations('dashboard.teacher.preview')

  return (
    <div className="sticky top-0 z-50 border-b bg-amber-50 dark:bg-amber-950/40 px-4 py-2">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200 min-w-0">
          <IconEye className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('banner')}</span>
        </div>
        <Link href={`/dashboard/teacher/courses/${courseId}`} className="shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs border-amber-300 dark:border-amber-700 whitespace-nowrap">
            <IconArrowLeft className="h-3 w-3" />
            {t('backToEditor')}
          </Button>
        </Link>
      </div>
    </div>
  )
}
