'use client'

import { useState, useCallback, useEffect, useMemo, createContext, use } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createLesson, updateLesson } from '@/app/actions/teacher/lessons'
import {
  IconFileText,
  IconLayoutGrid,
  IconPaperclip,
  IconRobot,
  IconCheck,
} from '@tabler/icons-react'

export interface LessonEditorProps {
  courseId: number
  courseTitle: string
  initialSequence: number
  initialData?: {
    id: number
    title: string
    description: string | null
    content: string | null
    video_url: string | null
    sequence: number
    status: 'draft' | 'published' | 'archived'
    publish_at: string | null
    ai_task_description: string | null
    ai_task_instructions: string | null
    resources?: { id: number; file_name: string; file_size: number; mime_type: string }[]
  }
}

export type EditorStep = 'details' | 'content' | 'resources' | 'ai-task'

export interface LessonFormData {
  title: string
  description: string
  content: string
  video_url: string
  sequence: number
  publish_at: string
  ai_task_description: string
  ai_task_instructions: string
}

export interface StepDefinition {
  key: EditorStep
  label: string
  icon: React.ReactNode
  complete: boolean
}

export interface LessonEditorContextValue {
  // State
  formData: LessonFormData
  loading: boolean
  error: string | null
  saveSuccess: boolean
  activeStep: EditorStep
  showPreview: boolean
  contentMode: 'visual' | 'mdx'

  // Initial data (for edit mode detection)
  initialData: LessonEditorProps['initialData']
  courseId: number
  courseTitle: string

  // Actions
  updateField: <K extends keyof LessonFormData>(key: K, value: LessonFormData[K]) => void
  setFormData: React.Dispatch<React.SetStateAction<LessonFormData>>
  handleSave: (publish: boolean) => Promise<void>
  setActiveStep: (step: EditorStep) => void
  setShowPreview: (show: boolean) => void
  setContentMode: (mode: 'visual' | 'mdx') => void
  setError: (error: string | null) => void

  // Derived
  isDetailsComplete: boolean
  isContentComplete: boolean
  hasAITask: boolean
  hasResources: boolean
  steps: StepDefinition[]
}

const LessonEditorContext = createContext<LessonEditorContextValue | null>(null)

export function useLessonEditor() {
  const ctx = use(LessonEditorContext)
  if (!ctx) throw new Error('useLessonEditor must be used within LessonEditorProvider')
  return ctx
}

export function LessonEditorProvider({
  courseId,
  courseTitle,
  initialSequence,
  initialData,
  children,
}: LessonEditorProps & { children: React.ReactNode }) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<EditorStep>('details')
  const [showPreview, setShowPreview] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [contentMode, setContentMode] = useState<'visual' | 'mdx'>('visual')

  const [formData, setFormData] = useState<LessonFormData>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    content:
      initialData?.content ??
      (initialData
        ? ''
        : `# Nuevo tema\n\nEscribe el contenido de la lección aquí...\n\n<Callout type="info">Añade los objetivos de aprendizaje aquí</Callout>`),
    video_url: initialData?.video_url || '',
    sequence: initialData?.sequence || initialSequence,
    publish_at: initialData?.publish_at || '',
    ai_task_description: initialData?.ai_task_description || '',
    ai_task_instructions: initialData?.ai_task_instructions || '',
  })

  const updateField = useCallback(
    <K extends keyof LessonFormData>(key: K, value: LessonFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  // Clear success indicator after 2s
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
        content: formData.content,
        video_url: formData.video_url,
        sequence: formData.sequence,
        publish,
        publish_at: formData.publish_at,
        ai_task_description: formData.ai_task_description,
        ai_task_instructions: formData.ai_task_instructions,
      }

      const result = initialData
        ? await updateLesson(courseId, initialData.id, data)
        : await createLesson(courseId, data)

      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }

      if (publish) {
        router.push(`/dashboard/teacher/courses/${courseId}`)
      } else {
        setSaveSuccess(true)
        setLoading(false)
      }
    } catch (err: any) {
      console.error('Error saving lesson:', err)
      setError(err.message || t('saveError'))
      setLoading(false)
    }
  }

  // Completion checks for steps
  const isDetailsComplete = formData.title.trim().length > 0
  const isContentComplete = (formData.content?.trim().length ?? 0) > 20
  const hasAITask =
    formData.ai_task_description.trim().length > 0 ||
    formData.ai_task_instructions.trim().length > 0
  const hasResources = (initialData?.resources?.length ?? 0) > 0

  const steps: StepDefinition[] = [
    {
      key: 'details',
      label: t('details'),
      icon: <IconFileText className="h-4 w-4" />,
      complete: isDetailsComplete,
    },
    {
      key: 'content',
      label: t('contentLabel'),
      icon: <IconLayoutGrid className="h-4 w-4" />,
      complete: isContentComplete,
    },
    {
      key: 'resources',
      label: t('resources'),
      icon: <IconPaperclip className="h-4 w-4" />,
      complete: hasResources,
    },
    {
      key: 'ai-task',
      label: t('aiTaskTitle'),
      icon: <IconRobot className="h-4 w-4" />,
      complete: hasAITask,
    },
  ]

  const value = useMemo(() => ({
    formData, loading, error, saveSuccess, activeStep, showPreview, contentMode,
    initialData, courseId, courseTitle,
    updateField, setFormData, handleSave, setActiveStep, setShowPreview,
    setContentMode, setError,
    isDetailsComplete, isContentComplete, hasAITask, hasResources, steps,
  }), [formData, loading, error, saveSuccess, activeStep, showPreview, contentMode,
    initialData, courseId, courseTitle, isDetailsComplete, isContentComplete, hasAITask, hasResources])

  return (
    <LessonEditorContext value={value}>
      {children}
    </LessonEditorContext>
  )
}
