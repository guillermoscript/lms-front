'use client'

import { useRef, useState } from 'react'
import type { ImageBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconPhoto, IconUpload, IconLoader2 } from '@tabler/icons-react'
import { uploadCourseImage } from '@/app/actions/teacher/course-images'
import { ExpiringUrlWarning } from './expiring-url-warning'

interface ImageBlockEditorProps {
  block: ImageBlock
  onChange: (updates: Partial<ImageBlock>) => void
}

export function ImageBlockEditor({ block, onChange }: ImageBlockEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const data = new FormData()
      data.append('file', file)
      const result = await uploadCourseImage(data)
      if (result.success) {
        // Public course-images bucket URL — permanent, readable by anyone
        // (lesson content is served to logged-out visitors on preview lessons).
        onChange({ src: result.url })
      } else {
        setUploadError(result.error)
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir la imagen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconPhoto className="h-4 w-4 text-primary" />
        Imagen
      </div>
      <div className="flex gap-2">
        <Input
          value={block.src}
          onChange={(e) => onChange({ src: e.target.value })}
          placeholder="URL de la imagen"
          className="flex-1"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 gap-1.5"
        >
          {uploading ? (
            <IconLoader2 className="h-4 w-4 animate-spin" />
          ) : (
            <IconUpload className="h-4 w-4" />
          )}
          Subir
        </Button>
      </div>
      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}
      <ExpiringUrlWarning
        url={block.src}
        hint="Usa el botón «Subir» para alojarla de forma permanente."
      />
      <Input
        value={block.alt}
        onChange={(e) => onChange({ alt: e.target.value })}
        placeholder="Texto alternativo (accesibilidad)"
      />
      <Input
        value={block.caption || ''}
        onChange={(e) => onChange({ caption: e.target.value || undefined })}
        placeholder="Pie de imagen (opcional)"
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
