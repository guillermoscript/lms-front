'use client'

import { useTranslations } from 'next-intl'
import { ExerciseBuilderProvider, useExerciseBuilder } from './exercise-builder-context'
import type { ExerciseBuilderProps } from './exercise-builder-context'
import { ExerciseBuilderToolbar } from './exercise-builder-toolbar'
import { ExerciseDetailsStep } from './exercise-details-step'
import { ExerciseAIConfigStep } from './exercise-ai-config-step'
import { ExerciseAudioConfigStep } from './exercise-audio-config-step'
import { IconAlertTriangle, IconX } from '@tabler/icons-react'

export function ExerciseBuilder(props: ExerciseBuilderProps) {
  return (
    <ExerciseBuilderProvider {...props}>
      <ExerciseBuilderShell />
    </ExerciseBuilderProvider>
  )
}

function ExerciseBuilderShell() {
  const { activeStep, error, setError } = useExerciseBuilder()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')

  return (
    <div className="flex flex-col">
      <ExerciseBuilderToolbar />

      {/* Error Banner */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5">
          <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-destructive/60 hover:text-destructive"
            aria-label={t('dismissError')}
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Step panels */}
      {activeStep === 'details' && <ExerciseDetailsStep />}
      {activeStep === 'ai-config' && <ExerciseAIConfigStep />}
      {activeStep === 'audio-config' && <ExerciseAudioConfigStep />}
    </div>
  )
}
