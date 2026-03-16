'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  IconEye,
  IconX,
  IconFileText,
} from '@tabler/icons-react'
import { MDXPreview } from '../mdx-preview'
import { cn } from '@/lib/utils'
import { useLessonEditor } from './lesson-editor-context'

export function LessonPreviewPanel() {
  const { formData, showPreview, setShowPreview } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  return (
    <div
      className={cn(
        'hidden lg:flex flex-col border-l bg-muted/20 transition-all duration-300 overflow-hidden',
        showPreview ? 'w-1/2 opacity-100' : 'w-0 opacity-0'
      )}
    >
      {showPreview && (
        <>
          <div className="flex h-12 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <IconEye className="h-4 w-4" />
              {t('previewTitle')}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setShowPreview(false)}
              aria-label={t('closePreview')}
            >
              <IconX className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <article className="prose prose-neutral dark:prose-invert max-w-none">
              {formData.title && (
                <h1 className="mb-3 text-2xl font-bold tracking-tight">
                  {formData.title}
                </h1>
              )}

              {formData.description && (
                <p className="mb-6 text-muted-foreground leading-relaxed">
                  {formData.description}
                </p>
              )}

              {formData.video_url && (
                <div className="mb-6 aspect-video overflow-hidden rounded-lg bg-muted">
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Video: {formData.video_url}
                  </p>
                </div>
              )}

              {formData.content ? (
                <MDXPreview content={formData.content} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 rounded-full bg-muted p-3">
                    <IconFileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('previewWriting')}
                  </p>
                </div>
              )}
            </article>
          </div>
        </>
      )}
    </div>
  )
}
