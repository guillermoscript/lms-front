'use client'

import type { FileDownloadBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconFileDownload } from '@tabler/icons-react'

interface FileDownloadBlockEditorProps {
  block: FileDownloadBlock
  onChange: (updates: Partial<FileDownloadBlock>) => void
}

export function FileDownloadBlockEditor({ block, onChange }: FileDownloadBlockEditorProps) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconFileDownload className="h-4 w-4 text-primary" />
        File Download
      </div>
      <Input
        value={block.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="File URL (e.g. https://example.com/document.pdf)"
      />
      <Input
        value={block.filename}
        onChange={(e) => onChange({ filename: e.target.value })}
        placeholder="Filename (e.g. worksheet.pdf)"
      />
      <Input
        value={block.description || ''}
        onChange={(e) => onChange({ description: e.target.value || undefined })}
        placeholder="Description (optional)"
        className="text-sm"
      />
    </div>
  )
}
