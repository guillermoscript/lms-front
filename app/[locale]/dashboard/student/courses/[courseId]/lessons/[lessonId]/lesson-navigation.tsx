'use client'

import { useState, useTransition, useRef } from 'react'
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
import confetti from 'canvas-confetti'

interface LessonNavigationProps {
  lessonId: number
  courseId: number
  isCompleted: boolean
  prevLessonId?: number
  nextLessonId?: number
  tenantId: string
  requireSequentialCompletion?: boolean
}

export function LessonNavigation({
  lessonId,
  courseId,
  isCompleted,
  prevLessonId,
  nextLessonId,
  tenantId,
  requireSequentialCompletion = false,
}: LessonNavigationProps) {
  const t = useTranslations('components.lessonNavigation')
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(isCompleted)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createClient()
  const buttonRef = useRef<HTMLButtonElement>(null)

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
      setLoading(false)
      startTransition(() => { router.refresh() })
    } else {
      await supabase.from('lesson_completions').insert({
        lesson_id: lessonId,
        user_id: user.id,
        tenant_id: tenantId,
      })

      setCompleted(true)
      setLoading(false)

      // Celebrate completion with a subtle confetti burst from the button
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        const x = (rect.left + rect.width / 2) / window.innerWidth
        const y = (rect.top + rect.height / 2) / window.innerHeight
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { x, y },
          colors: ['#10b981', '#34d399', '#6ee7b7'],
          ticks: 120,
          gravity: 1.2,
          scalar: 0.8,
          disableForReducedMotion: true,
        })
      }

      if (nextLessonId) {
        startTransition(() => {
          router.push(`/dashboard/student/courses/${courseId}/lessons/${nextLessonId}`)
        })
      } else {
        startTransition(() => { router.refresh() })
      }
    }
  }

  return (
    <footer className="shrink-0 border-t bg-card/80 backdrop-blur-sm px-3 py-2 sm:px-4 sm:py-3 md:px-6">
      <div className="flex items-center justify-between gap-2 sm:gap-3 max-w-4xl mx-auto">
        {/* Previous */}
        <div className="flex-1 flex justify-start">
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
          ref={buttonRef}
          onClick={handleComplete}
          data-testid="lesson-complete-toggle"
          disabled={loading}
          variant={completed ? 'secondary' : 'default'}
          size="sm"
          className={cn(
            'gap-2 px-5 font-semibold transition-all duration-300',
            completed && 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20'
          )}
        >
          {loading ? (
            <IconLoader2 className="h-4 w-4 motion-safe:animate-spin" />
          ) : completed ? (
            <IconCircleCheck className="h-4 w-4" />
          ) : (
            <IconCheck className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{completed ? t('completed') : t('markAsComplete')}</span>
          <span className="sm:hidden">{completed ? t('done') : t('complete')}</span>
        </Button>

        {/* Next */}
        <div className="flex-1 flex justify-end">
          {nextLessonId ? (
            requireSequentialCompletion && !completed ? (
              <Button size="sm" className="gap-1.5" disabled title={t('completeFirst')}>
                <span className="hidden sm:inline">{t('next')}</span>
                <IconArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLessonId}`}>
                <Button size="sm" className="gap-1.5">
                  <span className="hidden sm:inline">{t('next')}</span>
                  <IconArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )
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
