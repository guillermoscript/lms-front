'use client'

import { useTranslations } from 'next-intl'

import type { VideoBlock } from '../types'
import { Input } from '@/components/ui/input'
import { getEmbedUrl, VIDEO_IFRAME_ALLOW } from '@/lib/video/embed'
import { IconVideo, IconAlertCircle } from '@tabler/icons-react'

interface VideoBlockEditorProps {
  block: VideoBlock
  onChange: (updates: Partial<VideoBlock>) => void
}

export function VideoBlockEditor({ block, onChange }: VideoBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  const embedUrl = getEmbedUrl(block.url)
  const hasUrl = block.url.trim().length > 0
  const isInvalid = hasUrl && !embedUrl

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconVideo className="h-4 w-4 text-primary" />
        {t('blocks.video.label')}
      </div>
      <Input
        value={block.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder={t('video.urlPlaceholder')}
      />
      {isInvalid && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <IconAlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{t('video.unrecognized')}</span>
        </div>
      )}
      {embedUrl && (
        <div className="mt-2 aspect-video overflow-hidden rounded-md bg-muted">
          <iframe
            src={embedUrl}
            className="h-full w-full"
            allowFullScreen
            allow={VIDEO_IFRAME_ALLOW}
            title={t('video.previewTitle')}
          />
        </div>
      )}
    </div>
  )
}
