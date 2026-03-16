'use client'

import { useState, useCallback, useEffect, useMemo, createContext, use } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createExercise, updateExercise } from '@/app/actions/teacher/exercises'
import {
  IconSettings2,
  IconRobot,
  IconMicrophone,
  IconCheck,
} from '@tabler/icons-react'

export interface ExerciseBuilderProps {
  courseId: number
  lessonId?: number
  initialData?: any
}

export type ExerciseStep = 'details' | 'ai-config' | 'audio-config'

export interface ExerciseFormData {
  title: string
  description: string
  instructions: string
  exercise_type: string
  difficulty_level: string
  time_limit: number
  system_prompt: string
  status: string
  // audio/video config
  topic_prompt: string
  min_duration_seconds: number
  max_duration_seconds: number
  passing_score: number
  max_daily_attempts: number
  rubric_filler_words: boolean
  rubric_pace: boolean
  rubric_structure: boolean
  rubric_confidence: boolean
}

export interface StepDefinition {
  key: ExerciseStep
  label: string
  icon: React.ReactNode
  complete: boolean
}

export interface ExerciseBuilderContextValue {
  // State
  formData: ExerciseFormData
  loading: boolean
  error: string | null
  saveSuccess: boolean
  activeStep: ExerciseStep

  // Props pass-through
  initialData: ExerciseBuilderProps['initialData']
  courseId: number

  // Derived
  isAudioType: boolean
  isDetailsComplete: boolean
  hasAIConfig: boolean
  steps: StepDefinition[]

  // Actions
  updateField: <K extends keyof ExerciseFormData>(key: K, value: ExerciseFormData[K]) => void
  setFormData: React.Dispatch<React.SetStateAction<ExerciseFormData>>
  handleSave: (publish: boolean) => Promise<void>
  setActiveStep: (step: ExerciseStep) => void
  setError: (error: string | null) => void
}

const ExerciseBuilderContext = createContext<ExerciseBuilderContextValue | null>(null)

export function useExerciseBuilder() {
  const ctx = use(ExerciseBuilderContext)
  if (!ctx) throw new Error('useExerciseBuilder must be used within ExerciseBuilderProvider')
  return ctx
}

export function ExerciseBuilderProvider({
  courseId,
  lessonId,
  initialData,
  children,
}: ExerciseBuilderProps & { children: React.ReactNode }) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeStep, setActiveStep] = useState<ExerciseStep>('details')

  const [formData, setFormData] = useState<ExerciseFormData>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    instructions: initialData?.instructions || '',
    exercise_type: initialData?.exercise_type || 'essay',
    difficulty_level: initialData?.difficulty_level || 'medium',
    time_limit: initialData?.time_limit || 30,
    system_prompt: initialData?.system_prompt || '',
    status: initialData?.status || 'draft',
    // audio/video exercise config
    topic_prompt: initialData?.exercise_config?.topic_prompt || '',
    min_duration_seconds: initialData?.exercise_config?.min_duration_seconds || 30,
    max_duration_seconds: initialData?.exercise_config?.max_duration_seconds || 300,
    passing_score: initialData?.exercise_config?.passing_score ?? 70,
    max_daily_attempts: initialData?.exercise_config?.max_daily_attempts ?? 5,
    rubric_filler_words: initialData?.exercise_config?.rubric?.filler_words !== false,
    rubric_pace: initialData?.exercise_config?.rubric?.pace !== false,
    rubric_structure: initialData?.exercise_config?.rubric?.structure !== false,
    rubric_confidence: initialData?.exercise_config?.rubric?.confidence !== false,
  })

  const isAudioType = formData.exercise_type === 'audio_evaluation' || formData.exercise_type === 'video_evaluation'

  const updateField = useCallback(
    <K extends keyof ExerciseFormData>(key: K, value: ExerciseFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [saveSuccess])

  const handleSave = async (publish: boolean) => {
    setLoading(true)
    setError(null)

    try {
      const data = {
        title: formData.title,
        description: formData.description,
        instructions: formData.instructions,
        exercise_type: formData.exercise_type,
        difficulty_level: formData.difficulty_level,
        time_limit: formData.time_limit,
        system_prompt: formData.system_prompt,
        status: formData.status,
        publish,
        lesson_id: lessonId || null,
        // Audio/video config fields
        topic_prompt: formData.topic_prompt,
        min_duration_seconds: formData.min_duration_seconds,
        max_duration_seconds: formData.max_duration_seconds,
        passing_score: formData.passing_score,
        max_daily_attempts: formData.max_daily_attempts,
        rubric_filler_words: formData.rubric_filler_words,
        rubric_pace: formData.rubric_pace,
        rubric_structure: formData.rubric_structure,
        rubric_confidence: formData.rubric_confidence,
      }

      const result = initialData
        ? await updateExercise(courseId, initialData.id, data)
        : await createExercise(courseId, data)

      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }

      if (publish) {
        router.push(`/dashboard/teacher/courses/${courseId}/exercises`)
        router.refresh()
      } else {
        setSaveSuccess(true)
        setLoading(false)
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || t('saveError'))
      setLoading(false)
    }
  }

  // Completion checks
  const isDetailsComplete = formData.title.trim().length > 0
  const hasAIConfig =
    formData.instructions.trim().length > 0 ||
    formData.system_prompt.trim().length > 0

  const steps: StepDefinition[] = [
    {
      key: 'details',
      label: t('details'),
      icon: <IconSettings2 className="h-4 w-4" />,
      complete: isDetailsComplete,
    },
    ...(isAudioType ? [{
      key: 'audio-config' as ExerciseStep,
      label: t('audioSetupTitle'),
      icon: <IconMicrophone className="h-4 w-4" />,
      complete: formData.topic_prompt.trim().length > 0,
    }] : [{
      key: 'ai-config' as ExerciseStep,
      label: t('aiConfigTitle'),
      icon: <IconRobot className="h-4 w-4" />,
      complete: hasAIConfig,
    }]),
  ]

  const value = useMemo(() => ({
    formData, loading, error, saveSuccess, activeStep,
    initialData, courseId,
    isAudioType, isDetailsComplete, hasAIConfig, steps,
    updateField, setFormData, handleSave, setActiveStep, setError,
  }), [formData, loading, error, saveSuccess, activeStep,
    initialData, courseId, isAudioType, isDetailsComplete, hasAIConfig])

  return (
    <ExerciseBuilderContext value={value}>
      {children}
    </ExerciseBuilderContext>
  )
}
