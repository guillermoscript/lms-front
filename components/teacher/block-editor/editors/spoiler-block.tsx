'use client'

import type { SpoilerBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { IconEyeOff } from '@tabler/icons-react'

interface SpoilerBlockEditorProps {
  block: SpoilerBlock
  onChange: (updates: Partial<SpoilerBlock>) => void
}

export function SpoilerBlockEditor({ block, onChange }: SpoilerBlockEditorProps) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconEyeOff className="h-4 w-4" />
        Spoiler / Contenido oculto
      </div>
      <Input
        value={block.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Texto del botón (ej: Mostrar solución)"
        className="text-sm"
      />
      <Textarea
        value={block.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder="Contenido oculto..."
        className="min-h-[80px]"
      />
    </div>
  )
}
