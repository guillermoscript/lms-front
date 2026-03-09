'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  IconPaperclip,
  IconDownload,
  IconFile,
  IconFileTypePdf,
  IconFileSpreadsheet,
  IconFileText,
  IconPhoto,
  IconLoader2,
} from '@tabler/icons-react'
import { getResourceDownloadUrl } from '@/app/actions/teacher/lesson-resources'

interface Resource {
  id: number
  file_name: string
  file_size: number
  mime_type: string
}

interface LessonResourcesProps {
  resources: Resource[]
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return <IconFileTypePdf className="h-5 w-5 text-red-500" />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv')
    return <IconFileSpreadsheet className="h-5 w-5 text-emerald-500" />
  if (mimeType.includes('word') || mimeType.includes('document'))
    return <IconFileText className="h-5 w-5 text-blue-500" />
  if (mimeType.startsWith('image/')) return <IconPhoto className="h-5 w-5 text-violet-500" />
  return <IconFile className="h-5 w-5 text-muted-foreground" />
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function LessonResources({ resources }: LessonResourcesProps) {
  const t = useTranslations('components.lessons')
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  if (!resources.length) return null

  async function handleDownload(resourceId: number) {
    setDownloadingId(resourceId)
    const result = await getResourceDownloadUrl(resourceId)
    if (result.success && result.data) {
      window.open(result.data.url, '_blank')
    }
    setDownloadingId(null)
  }

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <IconPaperclip className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t('resources')}</h3>
      </div>

      <div className="space-y-1.5">
        {resources.map((resource) => (
          <div
            key={resource.id}
            className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5"
          >
            {getFileIcon(resource.mime_type)}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{resource.file_name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(resource.file_size)}</p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground hover:text-primary shrink-0"
              onClick={() => handleDownload(resource.id)}
              disabled={downloadingId === resource.id}
            >
              {downloadingId === resource.id ? (
                <IconLoader2 className="h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <IconDownload className="h-4 w-4" />
              )}
              <span className="hidden sm:inline text-xs">{t('downloadFile')}</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
