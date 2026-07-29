'use client'

import { useTranslations } from 'next-intl'

import type { AudioBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconVolume } from '@tabler/icons-react'
import { ExpiringUrlWarning } from './expiring-url-warning'

interface AudioBlockEditorProps {
  block: AudioBlock
  onChange: (updates: Partial<AudioBlock>) => void
}

export function AudioBlockEditor({ block, onChange }: AudioBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconVolume className="h-4 w-4 text-primary" />
        {t('blocks.audio.label')}
      </div>
      <Input
        value={block.src}
        onChange={(e) => onChange({ src: e.target.value })}
        placeholder={t('audio.urlPlaceholder')}
      />
      <ExpiringUrlWarning
        url={block.src}
        hint={t('audio.uploadHint')}
      />
      <Input
        value={block.title || ''}
        onChange={(e) => onChange({ title: e.target.value || undefined })}
        placeholder={t('audio.titlePlaceholder')}
        className="text-sm"
      />
      {block.src && (
        <div className="mt-2 overflow-hidden rounded-md border p-2">
          <audio controls className="w-full" src={block.src}>
            {t('audio.unsupported')}
          </audio>
        </div>
      )}
    </div>
  )
}
