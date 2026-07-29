'use client'

import { useTranslations } from 'next-intl'

import type { VocabularyBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconBook } from '@tabler/icons-react'

interface VocabularyBlockEditorProps {
  block: VocabularyBlock
  onChange: (updates: Partial<VocabularyBlock>) => void
}

export function VocabularyBlockEditor({ block, onChange }: VocabularyBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
        <IconBook className="h-4 w-4" />
        {t('blocks.vocabulary.label')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={block.word}
          onChange={(e) => onChange({ word: e.target.value })}
          placeholder={t('vocabulary.word')}
        />
        <Input
          value={block.translation}
          onChange={(e) => onChange({ translation: e.target.value })}
          placeholder={t('vocabulary.translation')}
        />
      </div>
      <Input
        value={block.audioUrl || ''}
        onChange={(e) => onChange({ audioUrl: e.target.value || undefined })}
        placeholder={t('vocabulary.audioUrl')}
        className="text-sm"
      />
    </div>
  )
}
