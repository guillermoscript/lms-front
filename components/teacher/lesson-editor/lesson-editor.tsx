'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  IconAlertTriangle,
  IconX,
  IconPaperclip,
  IconDeviceFloppy,
} from '@tabler/icons-react'
import { LessonResourcesManager } from '../lesson-resources-manager'
import { cn } from '@/lib/utils'
import { LessonEditorProvider, useLessonEditor } from './lesson-editor-context'
import type { LessonEditorProps } from './lesson-editor-context'
import { LessonEditorHeader } from './lesson-editor-header'
import { LessonEditorActions } from './lesson-editor-actions'
import { LessonDetailsStep } from './lesson-details-step'
import { LessonContentStep } from './lesson-content-step'
import { LessonAITaskStep } from './lesson-ai-task-step'
import { LessonPreviewPanel } from './lesson-preview-panel'

export function LessonEditor(props: LessonEditorProps) {
  return (
    <LessonEditorProvider {...props}>
      <LessonEditorShell />
    </LessonEditorProvider>
  )
}

function LessonEditorShell() {
  const { activeStep, showPreview, error, setError, initialData, loading, formData, handleSave } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <LessonEditorHeader />

      {/* ── Error Banner ────────────────────────────────────── */}
      {error && (
        <div className="flex-none border-b border-destructive/20 bg-destructive/5 px-4 py-2.5">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-destructive/60 hover:text-destructive" aria-label={t('dismissError')}>
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main Content Area ───────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor Panel */}
        <div
          className={cn(
            'flex-1 overflow-y-auto transition-all duration-300',
            showPreview ? 'lg:w-1/2' : 'w-full'
          )}
        >
          <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
            {/* ── STEP 1: Details ────────────────────────────── */}
            {activeStep === 'details' && <LessonDetailsStep />}

            {/* ── STEP 2: Content ───────────────────────────── */}
            {activeStep === 'content' && <LessonContentStep />}

            {/* ── STEP 3: Resources ─────────────────────────── */}
            {activeStep === 'resources' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {initialData?.id ? (
                  <LessonResourcesManager
                    lessonId={initialData.id}
                    initialResources={initialData.resources || []}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20 p-8 text-center">
                    <IconPaperclip className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {t('saveFirstForResources')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2"
                      onClick={() => handleSave(false)}
                      disabled={loading || !formData.title}
                    >
                      <IconDeviceFloppy className="h-3.5 w-3.5" />
                      {t('saveDraft')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 4: AI Task ───────────────────────────── */}
            {activeStep === 'ai-task' && <LessonAITaskStep />}
          </div>
        </div>

        <LessonPreviewPanel />
      </div>

      {/* ── Bottom Bar (mobile) ─────────────────────────────── */}
      <footer className="flex-none border-t bg-background p-3 lg:hidden">
        <LessonEditorActions layout="mobile" />
      </footer>
    </div>
  )
}
