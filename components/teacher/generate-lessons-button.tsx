'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconLoader2, IconSparkles } from '@tabler/icons-react'
import { generateStarterLessons } from '@/app/actions/admin/ai-course'
import { Button } from '@/components/ui/button'

interface GenerateLessonsButtonProps {
  courseId: number
}

/**
 * Secondary CTA on an empty course (#675): drafts a lesson outline into this
 * course with AI, then opens the first draft for review. Nothing publishes.
 */
export function GenerateLessonsButton({ courseId }: GenerateLessonsButtonProps) {
  const t = useTranslations('dashboard.teacher.manageCourse.curriculum')
  const router = useRouter()
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const response = await generateStarterLessons(courseId)
      if (!response.success || !response.data) {
        toast.error(!response.success ? response.error : t('generateError'))
        return
      }
      toast.success(t('generateSuccess', { count: response.data.lessonCount }))
      if (response.data.firstLessonId) {
        router.push(
          `/dashboard/teacher/courses/${courseId}/lessons/${response.data.firstLessonId}?from=new-course`
        )
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('generateError'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={handleGenerate}
      disabled={generating}
      data-testid="generate-lessons-ai"
    >
      {generating ? (
        <IconLoader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <IconSparkles className="h-4 w-4" aria-hidden="true" />
      )}
      {generating ? t('generating') : t('generateWithAi')}
    </Button>
  )
}
