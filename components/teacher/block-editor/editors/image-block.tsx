'use client'

import type { ImageBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconPhoto } from '@tabler/icons-react'

interface ImageBlockEditorProps {
  block: ImageBlock
  onChange: (updates: Partial<ImageBlock>) => void
}

export function ImageBlockEditor({ block, onChange }: ImageBlockEditorProps) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconPhoto className="h-4 w-4 text-primary" />
        Imagen
      </div>
      <Input
        value={block.src}
        onChange={(e) => onChange({ src: e.target.value })}
        placeholder="URL de la imagen"
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
