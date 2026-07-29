'use client'

import { useTranslations } from 'next-intl'
import {
  IconCode,
  IconLayoutGrid,
} from '@tabler/icons-react'
import { BlockEditor } from '../block-editor'
import { MarkdownField } from './markdown-field'
import { cn } from '@/lib/utils'
import { GenerateQuestionsDialog } from './generate-questions-dialog'
import { useLessonEditor } from './lesson-editor-context'

export function LessonContentStep() {
  const { formData, updateField, contentMode, setContentMode, courseId, initialData } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Editor mode toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {formData.title && (
            <h2 className="text-lg font-semibold tracking-tight text-muted-foreground/80">
              {formData.title}
            </h2>
          )}
        </div>

        <div className="flex items-center gap-2">
          <GenerateQuestionsDialog />
          <span className="text-xs text-muted-foreground/50 mr-1">
            {t('editorMode')}
          </span>
          <div data-tour="lesson-editor-mode" className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setContentMode('visual')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                contentMode === 'visual'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <IconLayoutGrid className="h-3.5 w-3.5" />
              {t('modeVisual')}
            </button>
            <button
              type="button"
              onClick={() => setContentMode('mdx')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                contentMode === 'mdx'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <IconCode className="h-3.5 w-3.5" />
              {t('modeMDX')}
            </button>
          </div>
        </div>
      </div>

      {/* Visual Block Editor */}
      {contentMode === 'visual' && (
        <div className="animate-in fade-in duration-200">
          <BlockEditor
            initialContent={formData.content || ''}
            onChange={(mdx) => updateField('content', mdx)}
            checkpointContext={{ courseId, lessonId: initialData?.id ?? null }}
          />
        </div>
      )}

      {/* MDX Code Editor */}
      {contentMode === 'mdx' && (
        <div className="animate-in fade-in duration-200">
          <MarkdownField
            id="lesson-content"
            variant="terminal"
            preview="mdx"
            filename="lesson.mdx"
            value={formData.content || ''}
            onChange={(val) => updateField('content', val)}
            placeholder={t('contentPlaceholder') as string}
          />
          <p className="mt-2 text-[11px] text-muted-foreground/50">
            {t('contentHint')}
          </p>
        </div>
      )}
    </div>
  )
}
