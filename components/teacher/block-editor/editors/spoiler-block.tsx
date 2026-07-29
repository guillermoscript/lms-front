'use client'

import { useTranslations } from 'next-intl'

import type { SpoilerBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { IconEyeOff } from '@tabler/icons-react'

interface SpoilerBlockEditorProps {
  block: SpoilerBlock
  onChange: (updates: Partial<SpoilerBlock>) => void
}

export function SpoilerBlockEditor({ block, onChange }: SpoilerBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconEyeOff className="h-4 w-4" />
        {t('spoiler.title')}
      </div>
      <Input
        value={block.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder={t('spoiler.buttonPlaceholder')}
        className="text-sm"
      />
      <Textarea
        value={block.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder={t('spoiler.contentPlaceholder')}
        className="min-h-[80px]"
      />
    </div>
  )
}
