'use client'

import { useTranslations } from 'next-intl'

import type { DefinitionBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { IconBook } from '@tabler/icons-react'

interface DefinitionBlockEditorProps {
  block: DefinitionBlock
  onChange: (updates: Partial<DefinitionBlock>) => void
}

export function DefinitionBlockEditor({ block, onChange }: DefinitionBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconBook className="h-4 w-4 text-primary" />
        {t('blocks.definition.label')}
      </div>
      <Input
        value={block.term}
        onChange={(e) => onChange({ term: e.target.value })}
        placeholder={t('definition.termPlaceholder')}
        className="font-semibold"
      />
      <Textarea
        value={block.definition}
        onChange={(e) => onChange({ definition: e.target.value })}
        placeholder={t('definition.definitionPlaceholder')}
        className="min-h-[60px]"
      />
    </div>
  )
}
