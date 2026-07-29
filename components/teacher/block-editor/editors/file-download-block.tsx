'use client'

import { useTranslations } from 'next-intl'

import type { FileDownloadBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconFileDownload } from '@tabler/icons-react'
import { ExpiringUrlWarning } from './expiring-url-warning'

interface FileDownloadBlockEditorProps {
  block: FileDownloadBlock
  onChange: (updates: Partial<FileDownloadBlock>) => void
}

export function FileDownloadBlockEditor({ block, onChange }: FileDownloadBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconFileDownload className="h-4 w-4 text-primary" />
        {t('blocks.file-download.label')}
      </div>
      <Input
        value={block.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder={t('fileDownload.urlPlaceholder')}
      />
      <ExpiringUrlWarning
        url={block.url}
        hint={t('fileDownload.uploadHint')}
      />
      <Input
        value={block.filename}
        onChange={(e) => onChange({ filename: e.target.value })}
        placeholder={t('fileDownload.filenamePlaceholder')}
      />
      <Input
        value={block.description || ''}
        onChange={(e) => onChange({ description: e.target.value || undefined })}
        placeholder={t('fileDownload.descriptionPlaceholder')}
        className="text-sm"
      />
    </div>
  )
}
