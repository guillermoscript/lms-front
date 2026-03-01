'use client'

import type { CalloutBlock } from '../types'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconInfoCircle, IconAlertTriangle, IconCircleCheck, IconCircleX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface CalloutBlockEditorProps {
  block: CalloutBlock
  onChange: (updates: Partial<CalloutBlock>) => void
}

const variants = {
  info: { icon: IconInfoCircle, bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-600' },
  warning: { icon: IconAlertTriangle, bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-600' },
  success: { icon: IconCircleCheck, bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-600' },
  error: { icon: IconCircleX, bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-600' },
}

export function CalloutBlockEditor({ block, onChange }: CalloutBlockEditorProps) {
  const v = variants[block.variant] || variants.info
  const Icon = v.icon

  return (
    <div className={cn('rounded-lg border p-3', v.bg, v.border)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', v.text)} />
        <div className="flex-1 space-y-2">
          <Select
            value={block.variant}
            onValueChange={(v) => onChange({ variant: v as CalloutBlock['variant'] })}
          >
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder="Contenido del callout..."
            className="min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  )
}
