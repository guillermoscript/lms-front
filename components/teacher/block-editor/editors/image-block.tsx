'use client'

import { useTranslations } from 'next-intl'

import type { ImageBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconPhoto, IconUpload } from '@tabler/icons-react'
import { ImagePicker } from '@/components/teacher/image-picker'
import { ExpiringUrlWarning } from './expiring-url-warning'

interface ImageBlockEditorProps {
  block: ImageBlock
  onChange: (updates: Partial<ImageBlock>) => void
}

export function ImageBlockEditor({ block, onChange }: ImageBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconPhoto className="h-4 w-4 text-primary" />
        {t('blocks.image.label')}
      </div>
      <div className="flex gap-2">
        <Input
          value={block.src}
          onChange={(e) => onChange({ src: e.target.value })}
          placeholder={t('image.urlPlaceholder')}
          className="flex-1"
        />
        <ImagePicker
          onSelect={(src) => onChange({ src })}
          trigger={
            <Button type="button" variant="outline" size="sm" className="flex-shrink-0 gap-1.5">
              <IconUpload className="h-4 w-4" />
              {t('image.upload')}
            </Button>
          }
        />
      </div>
      <ExpiringUrlWarning
        url={block.src}
        hint={t('image.uploadHint')}
      />
      <Input
        value={block.alt}
        onChange={(e) => onChange({ alt: e.target.value })}
        placeholder={t('image.altPlaceholder')}
      />
      <Input
        value={block.caption || ''}
        onChange={(e) => onChange({ caption: e.target.value || undefined })}
        placeholder={t('image.captionPlaceholder')}
        className="text-sm"
      />
      {block.src && (
        <div className="mt-2 overflow-hidden rounded-md border">
          <img
            src={block.src}
            alt={block.alt || 'Preview'}
            className="max-h-48 w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
      )}
    </div>
  )
}
