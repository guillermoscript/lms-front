'use client'

import { useState, useCallback, useMemo, createContext, use } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createExam, updateExam, type ExamFormData as ActionExamFormData } from '@/app/actions/teacher/exams'
import {
  useSensor,
  useSensors,
  KeyboardSensor,
  PointerSensor,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'

export interface QuestionData {
  id: number | string
  question_text: string
  question_type: 'multiple_choice' | 'true_false' | 'free_text'
  points_possible: number
  sequence: number
  ai_grading_criteria: string
  expected_keywords: string[]
  grading_rubric?: string
  options: {
    id: number | string
    option_text: string
    is_correct: boolean
  }[]
}

export interface ExamFormData {
  title: string
  description: string
  duration: number
  sequence: number
  status: string
  questions: QuestionData[]
}

export interface ExamBuilderProps {
  courseId: number
  courseTitle: string
  initialData?: any
}

export interface ExamBuilderContextValue {
  // State
  formData: ExamFormData
  loading: boolean
  error: string | null

  // Props pass-through
  initialData: ExamBuilderProps['initialData']
  courseId: number
  courseTitle: string

  // Question actions
  addQuestion: (type: QuestionData['question_type']) => void
  removeQuestion: (id: number | string) => void
  updateQuestion: (id: number | string, updates: Partial<QuestionData>) => void
  handleDragEnd: (event: DragEndEvent) => void
  sensors: ReturnType<typeof useSensors>

  // Form actions
  updateField: <K extends keyof ExamFormData>(key: K, value: ExamFormData[K]) => void
  handleSave: (publish: boolean) => Promise<void>
  setError: (error: string | null) => void
}

const ExamBuilderContext = createContext<ExamBuilderContextValue | null>(null)

export function useExamBuilder() {
  const ctx = use(ExamBuilderContext)
  if (!ctx) throw new Error('useExamBuilder must be used within ExamBuilderProvider')
  return ctx
}

export function ExamBuilderProvider({
  courseId,
  courseTitle,
  initialData,
  children,
}: ExamBuilderProps & { children: React.ReactNode }) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.examBuilder')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<ExamFormData>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    duration: initialData?.duration || 60,
    sequence: initialData?.sequence || 1,
    status: initialData?.status || 'draft',
    questions: (initialData?.questions || [])
      .map((q: any) => ({
        ...q,
        id: q.question_id || `new-${Math.random()}`,
        expected_keywords: q.expected_keywords || [],
        ai_grading_criteria: q.ai_grading_criteria || '',
        points_possible: q.points_possible ?? 10,
        options: (q.options || []).map((o: any) => ({
          ...o,
          id: o.option_id || `new-opt-${Math.random()}`
        }))
      }))
      .sort((a: any, b: any) => a.sequence - b.sequence) as QuestionData[],
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setFormData((prev) => {
        const oldIndex = prev.questions.findIndex((q) => q.id === active.id)
        const newIndex = prev.questions.findIndex((q) => q.id === over.id)
        const newQuestions = arrayMove(prev.questions, oldIndex, newIndex).map(
          (q, idx) => ({ ...q, sequence: idx + 1 })
        )
        return { ...prev, questions: newQuestions }
      })
    }
  }, [])

  const addQuestion = useCallback((type: QuestionData['question_type']) => {
    setFormData((prev) => {
      const newQuestion: QuestionData = {
        id: `new-${Date.now()}`,
        question_text: '',
        question_type: type,
        points_possible: 10,
        sequence: prev.questions.length + 1,
        ai_grading_criteria: '',
        expected_keywords: [],
        grading_rubric: '',
        options: type === 'true_false'
          ? [
            { id: `opt-true-${Date.now()}`, option_text: 'True', is_correct: true },
            { id: `opt-false-${Date.now()}`, option_text: 'False', is_correct: false }
          ]
          : type === 'multiple_choice'
            ? [
              { id: `opt-1-${Date.now()}`, option_text: '', is_correct: true },
              { id: `opt-2-${Date.now()}`, option_text: '', is_correct: false }
            ]
            : [],
      }
      return { ...prev, questions: [...prev.questions, newQuestion] }
    })
  }, [])

  const removeQuestion = useCallback((id: number | string) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions
        .filter((q) => q.id !== id)
        .map((q, idx) => ({ ...q, sequence: idx + 1 })),
    }))
  }, [])

  const updateQuestion = useCallback((id: number | string, updates: Partial<QuestionData>) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    }))
  }, [])

  const updateField = useCallback(
    <K extends keyof ExamFormData>(key: K, value: ExamFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleSave = async (publish: boolean) => {
    setLoading(true)
    setError(null)

    const actionData: ActionExamFormData = {
      title: formData.title,
      description: formData.description,
      duration: formData.duration,
      sequence: formData.sequence,
      publish,
      questions: formData.questions.map(q => ({
        question_text: q.question_text,
        question_type: q.question_type,
        points_possible: q.points_possible,
        sequence: q.sequence,
        ai_grading_criteria: q.ai_grading_criteria,
        expected_keywords: q.expected_keywords,
        grading_rubric: q.grading_rubric,
        options: q.options.map(o => ({
          option_text: o.option_text,
          is_correct: o.is_correct,
        })),
      })),
    }

    const result = initialData?.exam_id
      ? await updateExam(courseId, initialData.exam_id, actionData)
      : await createExam(courseId, actionData)

    if (result.success) {
      router.push(`/dashboard/teacher/courses/${courseId}`)
      router.refresh()
    } else {
      setError(result.error || t('saveError'))
    }

    setLoading(false)
  }

  const value = useMemo(() => ({
    formData, loading, error,
    initialData, courseId, courseTitle,
    addQuestion, removeQuestion, updateQuestion, handleDragEnd, sensors,
    updateField, handleSave, setError,
  }), [formData, loading, error, initialData, courseId, courseTitle, sensors])

  return (
    <ExamBuilderContext value={value}>
      {children}
    </ExamBuilderContext>
  )
}
