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
    // The band is sticky, so the course scrolls underneath it: an opaque page
    // fill with the warning wash layered on top keeps it tinted without the
    // content showing through.
    <div className="sticky top-0 z-50 border-b bg-background bg-linear-to-r from-warning/10 to-warning/10 px-4 py-2">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-warning min-w-0">
          <IconEye className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('banner')}</span>
        </div>
        <Link href={`/dashboard/teacher/courses/${courseId}`} className="shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs border-warning/40 whitespace-nowrap">
            <IconArrowLeft className="h-3 w-3" />
            {t('backToEditor')}
          </Button>
        </Link>
      </div>
    </div>
  )
}
