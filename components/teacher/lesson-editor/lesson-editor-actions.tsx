'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  IconLoader2,
  IconCheck,
  IconDeviceFloppy,
  IconEye,
} from '@tabler/icons-react'
import { useLessonEditor } from './lesson-editor-context'

type ActionsLayout = 'desktop' | 'mobile'

export function LessonEditorActions({ layout }: { layout: ActionsLayout }) {
  const { loading, saveSuccess, formData, handleSave } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  return (
    <div data-tour="lesson-save" className={layout === 'mobile' ? 'flex gap-2' : 'flex items-center gap-2'}>
      <Button
        variant="outline"
        size="sm"
        className={layout === 'mobile' ? 'flex-1 gap-1.5' : 'h-8 gap-1.5'}
        onClick={() => handleSave(false)}
        disabled={loading || !formData.title}
      >
        {loading ? (
          <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
        ) : saveSuccess ? (
          <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <IconDeviceFloppy className="h-3.5 w-3.5" />
        )}
        {layout === 'desktop' && <span className="hidden sm:inline">{t('saveDraft')}</span>}
        {layout === 'mobile' && t('saveDraft')}
      </Button>

      <Button
        size="sm"
        className={layout === 'mobile' ? 'flex-1 gap-1.5' : 'h-8 gap-1.5'}
        onClick={() => handleSave(true)}
        disabled={loading || !formData.title}
      >
        {loading ? (
          <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
        ) : (
          <IconEye className="h-3.5 w-3.5" />
        )}
        {t('publishLesson')}
      </Button>
    </div>
  )
}
