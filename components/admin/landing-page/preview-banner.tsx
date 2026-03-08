'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconArrowLeft, IconEye } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface Props {
  status: 'draft' | 'published'
}

export function PreviewBanner({ status }: Props) {
  const router = useRouter()
  const t = useTranslations('landingPageBuilder.builder')

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border"
      role="banner"
      aria-label="Preview mode"
    >
      <div className="container mx-auto flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-3">
          <IconEye className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">{t('previewBanner')}</span>
          <Badge variant={status === 'published' ? 'default' : 'secondary'}>
            {status}
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">{t('previewBannerDescription')}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => router.push('/dashboard/admin/landing-page')}
        >
          <IconArrowLeft className="w-3.5 h-3.5" />
          {t('backToEditor')}
        </Button>
      </div>
    </div>
  )
}
