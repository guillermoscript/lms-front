'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useExerciseBuilder } from './exercise-builder-context'
import { Button } from '@/components/ui/button'
import { VersionHistorySheet } from '../version-history-sheet'
import {
  IconLoader2,
  IconDeviceFloppy,
  IconCheck,
  IconEye,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export function ExerciseBuilderToolbar() {
  const {
    activeStep, setActiveStep, steps,
    loading, saveSuccess, formData, handleSave,
    initialData,
  } = useExerciseBuilder()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')
  const router = useRouter()

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75 fill-mode-both">
      {/* Step nav */}
      <nav className="flex items-center gap-1 rounded-lg bg-muted/50 p-1 w-fit">
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
              {step.complete ? <IconCheck className="h-3 w-3" /> : i + 1}
            </span>
            {step.label}
          </button>
        ))}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {initialData && (
          <VersionHistorySheet
            contentType="exercise"
            contentId={initialData.id}
            currentSnapshot={formData as unknown as Record<string, unknown>}
            onRestore={() => router.refresh()}
          />
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
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
          {t('saveDraft')}
        </Button>

        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => handleSave(true)}
          disabled={loading || !formData.title}
        >
          {loading ? (
            <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          ) : (
            <IconEye className="h-3.5 w-3.5" />
          )}
          {t('publishExercise')}
        </Button>
      </div>
    </div>
  )
}
