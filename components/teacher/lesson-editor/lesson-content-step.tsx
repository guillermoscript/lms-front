'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  IconCode,
  IconLayoutGrid,
} from '@tabler/icons-react'
import { BlockEditor } from '../block-editor'
import MarkdownEditor from '../markdown-editor'
import { cn } from '@/lib/utils'
import { useLessonEditor } from './lesson-editor-context'

export function LessonContentStep() {
  const { formData, updateField, contentMode, setContentMode } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  const contentLineCount = useMemo(
    () => (formData.content || '').split('\n').length,
    [formData.content]
  )

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
          />
        </div>
      )}

      {/* MDX Code Editor */}
      {contentMode === 'mdx' && (
        <div className="animate-in fade-in duration-200">
          <div className="overflow-hidden rounded-xl border bg-[#1e1e2e] shadow-lg">
            {/* MDX editor toolbar */}
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/70" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                  <div className="h-3 w-3 rounded-full bg-green-500/70" />
                </div>
                <span className="ml-2 text-[11px] font-medium text-white/40">
                  lesson.mdx
                </span>
              </div>
              <span className="text-[10px] text-white/30">
                {contentLineCount} {t('lines')}
              </span>
            </div>
            {/* Editor area */}
            <div className="p-0">
              <MarkdownEditor
                value={formData.content || ''}
                onChange={(val) => updateField('content', val)}
                placeholder={t('contentPlaceholder') as string}
                rows={28}
                className="[&_textarea]:bg-transparent [&_textarea]:text-[#cdd6f4] [&_textarea]:caret-[#89b4fa] [&_textarea]:placeholder:text-white/20 [&_textarea]:border-0 [&_textarea]:rounded-none [&_textarea]:font-mono [&_textarea]:text-[13px] [&_textarea]:leading-6 [&_.btn-sm]:bg-white/10 [&_.btn-sm]:text-white/60 [&_.btn-sm]:border-white/10 [&_.btn-sm]:hover:bg-white/20 [&_.btn-sm]:hover:text-white/80 [&>div:first-child]:px-4 [&>div:first-child]:py-2 [&>div:first-child]:border-b [&>div:first-child]:border-white/10"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/50">
            {t('contentHint')}
          </p>
        </div>
      )}
    </div>
  )
}
