'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import type { TextSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function TextEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.text')
  const d = data as unknown as TextSectionData

  function set(key: keyof TextSectionData, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} />
      <TextareaField
        label={t('content')}
        hint={t('contentHint')}
        value={d.content ?? ''}
        onChange={v => set('content', v)}
        rows={8}
      />
    </div>
  )
}
