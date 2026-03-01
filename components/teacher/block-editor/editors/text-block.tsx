'use client'

import type { TextBlock } from '../types'
import { Textarea } from '@/components/ui/textarea'

interface TextBlockEditorProps {
  block: TextBlock
  onChange: (updates: Partial<TextBlock>) => void
}

export function TextBlockEditor({ block, onChange }: TextBlockEditorProps) {
  return (
    <Textarea
      value={block.content}
      onChange={(e) => onChange({ content: e.target.value })}
      placeholder="Escribe tu texto aquí... (soporta Markdown)"
      className="min-h-[80px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  )
}
