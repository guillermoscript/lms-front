'use client'

import { useTranslations } from 'next-intl'

import type { EmbedBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconWorldWww } from '@tabler/icons-react'

interface EmbedBlockEditorProps {
  block: EmbedBlock
  onChange: (updates: Partial<EmbedBlock>) => void
}

export function EmbedBlockEditor({ block, onChange }: EmbedBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconWorldWww className="h-4 w-4 text-primary" />
        {t('blocks.embed.label')}
      </div>
      <Input
        value={block.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder={t('embed.urlPlaceholder')}
      />
      <Input
        value={block.title || ''}
        onChange={(e) => onChange({ title: e.target.value || undefined })}
        placeholder={t('embed.titlePlaceholder')}
        className="text-sm"
      />
      <Input
        value={block.caption || ''}
        onChange={(e) => onChange({ caption: e.target.value || undefined })}
        placeholder={t('embed.captionPlaceholder')}
        className="text-sm"
      />
      {block.url && (
        <div className="mt-2 aspect-video overflow-hidden rounded-md bg-muted">
          <iframe
            src={block.url}
            className="h-full w-full"
            sandbox="allow-scripts allow-same-origin"
            title={block.title || t('embed.previewTitle')}
          />
        </div>
      )}
    </div>
  )
}
