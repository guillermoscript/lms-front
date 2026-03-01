'use client'

import type { HeadingBlock } from '../types'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface HeadingBlockEditorProps {
  block: HeadingBlock
  onChange: (updates: Partial<HeadingBlock>) => void
}

export function HeadingBlockEditor({ block, onChange }: HeadingBlockEditorProps) {
  const fontSizes: Record<number, string> = {
    1: 'text-2xl font-bold',
    2: 'text-xl font-semibold',
    3: 'text-lg font-medium',
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(block.level)}
        onValueChange={(v) => v && onChange({ level: parseInt(v) as 1 | 2 | 3 })}
      >
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">H1</SelectItem>
          <SelectItem value="2">H2</SelectItem>
          <SelectItem value="3">H3</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={block.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder="Título del encabezado"
        className={`flex-1 border-0 bg-transparent p-0 focus-visible:ring-0 ${fontSizes[block.level]}`}
      />
    </div>
  )
}
