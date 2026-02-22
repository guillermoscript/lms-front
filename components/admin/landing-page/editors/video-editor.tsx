'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import type { VideoSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function VideoEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.video')
  const d = data as unknown as VideoSectionData

  function set(key: keyof VideoSectionData, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} rows={2} />
      <TextField
        label={t('videoUrl')}
        hint={t('videoUrlHint')}
        value={d.videoUrl ?? ''}
        onChange={v => set('videoUrl', v)}
        placeholder="https://www.youtube.com/watch?v=..."
      />
    </div>
  )
}
