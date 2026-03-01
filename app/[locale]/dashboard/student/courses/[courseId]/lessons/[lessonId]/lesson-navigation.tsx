'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconLoader2,
  IconCircleCheck,
} from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface LessonNavigationProps {
  lessonId: number
  courseId: number
  isCompleted: boolean
  prevLessonId?: number
  nextLessonId?: number
}

export function LessonNavigation({
  lessonId,
  courseId,
  isCompleted,
  prevLessonId,
  nextLessonId,
}: LessonNavigationProps) {
  const t = useTranslations('components.lessonNavigation')
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(isCompleted)
  const router = useRouter()
  const supabase = createClient()

  async function handleComplete() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    if (completed) {
      await supabase
        .from('lesson_completions')
        .delete()
        .eq('lesson_id', lessonId)
        .eq('user_id', user.id)

      setCompleted(false)
    } else {
      await supabase.from('lesson_completions').insert({
        lesson_id: lessonId,
        user_id: user.id,
      })

      setCompleted(true)

      if (nextLessonId) {
        setTimeout(() => {
          router.push(`/dashboard/student/courses/${courseId}/lessons/${nextLessonId}`)
        }, 500)
      }
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <footer className="shrink-0 border-t bg-card/80 backdrop-blur-sm px-4 py-3 md:px-6">
      <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
        {/* Previous */}
        <div className="w-32">
          {prevLessonId ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${prevLessonId}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <IconArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{t('previous')}</span>
              </Button>
            </Link>
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <IconArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{t('backToCourse')}</span>
              </Button>
            </Link>
          )}
        </div>

        {/* Complete button */}
        <Button
          onClick={handleComplete}
          data-testid="lesson-complete-toggle"
          disabled={loading}
          variant={completed ? 'secondary' : 'default'}
          size="sm"
          className={cn(
            'gap-2 px-5 font-semibold transition-all',
            completed && 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20'
          )}
        >
          {loading ? (
            <IconLoader2 className="h-4 w-4 animate-spin" />
          ) : completed ? (
            <IconCircleCheck className="h-4 w-4" />
          ) : (
            <IconCheck className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{completed ? t('completed') : t('markAsComplete')}</span>
          <span className="sm:hidden">{completed ? t('done') : t('complete')}</span>
        </Button>

        {/* Next */}
        <div className="w-32 flex justify-end">
          {nextLessonId ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLessonId}`}>
              <Button size="sm" className="gap-1.5">
                <span className="hidden sm:inline">{t('next')}</span>
                <IconArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}>
              <Button size="sm" className="gap-1.5">
                <span className="hidden sm:inline">{t('finishCourse')}</span>
                <IconCheck className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </footer>
  )
}
