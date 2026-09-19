'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconEye } from '@tabler/icons-react'
import { Switch } from '@/components/ui/switch'
import { setLessonPreview } from '@/app/actions/teacher/lessons'

interface LessonPreviewToggleProps {
  courseId: number
  lessonId: number
  isPreview: boolean
  lessonTitle: string
}

/**
 * Free-preview switch on a lesson row (#791).
 *
 * Sits over the row's overlay link, so it stops the click from navigating into
 * the editor — the point of having it here is not opening the editor at all.
 * Optimistic: the switch moves first and rolls back if the write is refused.
 */
export function LessonPreviewToggle({
  courseId,
  lessonId,
  isPreview,
  lessonTitle,
}: LessonPreviewToggleProps) {
  const t = useTranslations('dashboard.teacher.manageCourse.curriculum')
  const [checked, setChecked] = useState(isPreview)
  const [isPending, startTransition] = useTransition()

  const onChange = (next: boolean) => {
    setChecked(next)
    startTransition(async () => {
      const result = await setLessonPreview(courseId, lessonId, next)
      if (!result.success) {
        setChecked(!next)
        toast.error(result.error)
        return
      }
      toast.success(next ? t('previewOn', { lesson: lessonTitle }) : t('previewOff', { lesson: lessonTitle }))
    })
  }

  return (
    <div
      className="flex items-center gap-2"
      // The whole row is a link; this control is not a way into the editor.
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <IconEye
        className={`h-3.5 w-3.5 ${checked ? 'text-brand-text' : 'text-muted-foreground/50'}`}
        aria-hidden="true"
      />
      <span className="hidden text-xs text-muted-foreground sm:inline">{t('previewLabel')}</span>
      <Switch
        checked={checked}
        disabled={isPending}
        onCheckedChange={onChange}
        aria-label={t('previewSwitchLabel', { lesson: lessonTitle })}
      />
    </div>
  )
}
