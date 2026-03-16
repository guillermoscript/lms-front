'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  IconArrowLeft,
  IconEye,
  IconEyeOff,
  IconCheck,
  IconChevronRight,
  IconCalendarEvent,
} from '@tabler/icons-react'
import { VersionHistorySheet } from '../version-history-sheet'
import { cn } from '@/lib/utils'
import { useLessonEditor } from './lesson-editor-context'
import { LessonEditorActions } from './lesson-editor-actions'

export function LessonEditorHeader() {
  const {
    courseId, courseTitle, initialData, formData,
    activeStep, setActiveStep, showPreview, setShowPreview,
    steps,
  } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')
  const router = useRouter()

  return (
    <header data-tour="lesson-header" className="flex-none border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
        {/* Left: back + breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          <Link href={`/dashboard/teacher/courses/${courseId}`}>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" aria-label={t('backToCourse', { course: courseTitle })}>
              <IconArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <span className="truncate max-w-[120px] lg:max-w-[200px]">{courseTitle}</span>
            <IconChevronRight className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground truncate">
              {initialData ? t('editTitle') : t('createTitle')}
            </span>
            {formData.publish_at && (
              <Badge variant="secondary" className="ml-2 text-[10px] shrink-0">
                <IconCalendarEvent className="mr-1 h-3 w-3" />
                {t('scheduledFor', { date: new Date(formData.publish_at).toLocaleDateString() })}
              </Badge>
            )}
          </div>
        </div>

        {/* Center: step nav (desktop) */}
        <nav data-tour="lesson-steps" className="hidden md:flex items-center gap-1 rounded-lg bg-muted/50 p-1">
          {steps.map((step, i) => (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveStep(step.key)}
              className={cn(
                'relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                activeStep === step.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                  step.complete
                    ? 'bg-emerald-500/15 text-emerald-600'
                    : activeStep === step.key
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {step.complete ? (
                  <IconCheck className="h-3 w-3" />
                ) : (
                  i + 1
                )}
              </span>
              {step.label}
            </button>
          ))}
        </nav>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          {initialData && (
            <VersionHistorySheet
              contentType="lesson"
              contentId={initialData.id}
              currentSnapshot={formData as unknown as Record<string, unknown>}
              onRestore={() => router.refresh()}
            />
          )}

          <Button
            data-tour="lesson-preview"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? (
              <IconEyeOff className="h-4 w-4" />
            ) : (
              <IconEye className="h-4 w-4" />
            )}
            <span className="hidden lg:inline">{t('previewTitle')}</span>
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <LessonEditorActions layout="desktop" />
        </div>
      </div>

      {/* Mobile step nav */}
      <div className="flex md:hidden items-center gap-1 px-4 pb-2 overflow-x-auto">
        {steps.map((step) => (
          <button
            key={step.key}
            type="button"
            onClick={() => setActiveStep(step.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-all',
              activeStep === step.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {step.complete && <IconCheck className="h-3 w-3" />}
            {step.label}
          </button>
        ))}
      </div>
    </header>
  )
}
