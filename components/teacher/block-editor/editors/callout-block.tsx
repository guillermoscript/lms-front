'use client'

import { useTranslations } from 'next-intl'

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
  info: { icon: IconInfoCircle, bg: 'bg-brand-tint', border: 'border-primary/20', text: 'text-brand-text' },
  warning: { icon: IconAlertTriangle, bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning' },
  success: { icon: IconCircleCheck, bg: 'bg-success/10', border: 'border-success/30', text: 'text-success' },
  error: { icon: IconCircleX, bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive' },
}

export function CalloutBlockEditor({ block, onChange }: CalloutBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
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
              <SelectItem value="info">{t('callout.info')}</SelectItem>
              <SelectItem value="warning">{t('callout.warning')}</SelectItem>
              <SelectItem value="success">{t('callout.success')}</SelectItem>
              <SelectItem value="error">{t('callout.error')}</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder={t('callout.placeholder')}
            className="min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  )
}
