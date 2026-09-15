'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next-nprogress-bar'
import Link from 'next/link'
import { useHotkey } from '@tanstack/react-hotkeys'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createClient } from '@/lib/supabase/client'
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconLoader2,
  IconCircleCheck,
  IconCertificate,
} from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import { useCheckpoints } from '@/components/lesson/checkpoints/checkpoints-provider'
import { useAnalytics } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

interface LessonNavigationProps {
  lessonId: number
  courseId: number
  isCompleted: boolean
  prevLessonId?: number
  nextLessonId?: number
  tenantId: string
  requireSequentialCompletion?: boolean
  completedCount?: number
  totalLessons?: number
}

export function LessonNavigation({
  lessonId,
  courseId,
  isCompleted,
  prevLessonId,
  nextLessonId,
  tenantId,
  requireSequentialCompletion = false,
  completedCount = 0,
  totalLessons = 0,
}: LessonNavigationProps) {
  const t = useTranslations('components.lessonNavigation')
  const tGamification = useTranslations('components.gamification')
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(isCompleted)
  const [certificateCode, setCertificateCode] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createClient()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const checkpointsCtx = useCheckpoints()
  const analytics = useAnalytics()
  // Wall-clock start of this lesson view, for `time_on_lesson_ms`. Armed in the
  // effect below rather than during render — `Date.now()` is impure and the
  // render path must stay so. Re-armed on every lessonId change because App
  // Router reuses this instance when the student moves to the next lesson; a
  // plain mount-time ref would accumulate across a whole course and report one
  // absurd number at the end.
  const viewStartedAtRef = useRef(0)
  // Partial guard against `course_completed` refiring when a student
  // uncompletes and recompletes the final lesson. There is NO durable latch to
  // key off: `enrollments.status` is only `active`/`disabled` (no completed
  // state) and no course-completion table exists, so inventing one for an
  // analytics event is not the trade. This ref covers the common case — the
  // toggle happens in one sitting, and `router.refresh()` re-renders without
  // remounting — but a full page reload between the two still double-counts.
  const courseCompletionTrackedRef = useRef(false)

  const nextBlocked = requireSequentialCompletion && !completed
  // Only gates going from incomplete → complete; un-completing is always allowed.
  const checkpointsBlocked = !completed && !!checkpointsCtx && checkpointsCtx.missingRequired > 0

  // One view per lesson. Deliberately NOT in the server component: completing a
  // lesson calls `router.refresh()`, which re-runs the server render and would
  // bill a second view for the same visit. The dep list is the lesson id alone,
  // so a refresh re-renders this without re-firing.
  useEffect(() => {
    viewStartedAtRef.current = Date.now()
    analytics.track(ANALYTICS_EVENTS.LESSON_VIEWED, {
      lesson_id: lessonId,
      course_id: courseId,
      total_lessons: totalLessons,
    })
    // `analytics` is a stable useMemo from the hook; listing it would not change
    // when the lesson does, and re-firing on identity churn is the bug here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  useHotkey('ArrowLeft', () => {
    if (prevLessonId) {
      router.push(`/dashboard/student/courses/${courseId}/lessons/${prevLessonId}`)
    }
  }, { enabled: !!prevLessonId })

  useHotkey('ArrowRight', () => {
    if (nextLessonId && !nextBlocked) {
      router.push(`/dashboard/student/courses/${courseId}/lessons/${nextLessonId}`)
    }
  }, { enabled: !!nextLessonId && !nextBlocked })

  // Un-completing is destructive (the completion row is deleted, the course
  // progress drops) and the button that does it is the same green "Done"
  // button the student just pressed — one accidental second tap silently
  // undid the lesson (#729). It now asks first; completing stays one click.
  const [uncompleteOpen, setUncompleteOpen] = useState(false)

  async function handleUncomplete() {
    setUncompleteOpen(false)
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) {
      setLoading(false)
      return
    }

    // Optimistic: flip immediately, revert on error
    setCompleted(false)

    const { error } = await supabase
      .from('lesson_completions')
      .delete()
      .eq('lesson_id', lessonId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Failed to uncomplete lesson:', error)
      toast.error(t('updateFailed'))
      setCompleted(true)
      setLoading(false)
      return
    }

    // After the delete lands, never on the optimistic flip above.
    analytics.track(ANALYTICS_EVENTS.LESSON_UNCOMPLETED, {
      lesson_id: lessonId,
      course_id: courseId,
    })

    toast.success(t('uncompleted'))
    setLoading(false)
    startTransition(() => { router.refresh() })
  }

  async function handleComplete() {
    if (completed) {
      setUncompleteOpen(true)
      return
    }
    if (checkpointsBlocked) {
      toast.error(
        t('checkpointsRequired', { count: checkpointsCtx?.missingRequired ?? 0 })
      )
      return
    }
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) {
      setLoading(false)
      return
    }

    {
      // Optimistic: celebrate immediately, revert on error
      setCompleted(true)
      const isCourseNowComplete = totalLessons > 0 && completedCount + 1 >= totalLessons

      toast.success(tGamification('xpAwarded.lesson_completion'))

      if (isCourseNowComplete) {
        toast.success(t('courseComplete'), {
          description: t('courseCompleteDescription'),
          duration: 8000,
        })
        // Full-width celebration for finishing the whole course
        confetti({
          particleCount: 120,
          spread: 100,
          origin: { x: 0.2, y: 0.8 },
          angle: 60,
          disableForReducedMotion: true,
        })
        confetti({
          particleCount: 120,
          spread: 100,
          origin: { x: 0.8, y: 0.8 },
          angle: 120,
          disableForReducedMotion: true,
        })
      } else if (buttonRef.current) {
        // Subtle confetti burst from the button
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

      const { error } = await supabase.from('lesson_completions').insert({
        lesson_id: lessonId,
        user_id: user.id,
      })

      if (error) {
        console.error('Failed to complete lesson:', error)
        toast.error(t('completeFailed'))
        setCompleted(false)
        setLoading(false)
        return
      }

      // The insert is the only proof the completion is real — the UI flipped
      // optimistically several lines ago and reverts on the branch above, so
      // tracking any earlier would count completions that errored.
      analytics.track(ANALYTICS_EVENTS.LESSON_COMPLETED, {
        lesson_id: lessonId,
        course_id: courseId,
        time_on_lesson_ms: viewStartedAtRef.current
          ? Date.now() - viewStartedAtRef.current
          : null,
        is_sequential: requireSequentialCompletion,
      })

      if (isCourseNowComplete && !courseCompletionTrackedRef.current) {
        courseCompletionTrackedRef.current = true
        analytics.track(ANALYTICS_EVENTS.COURSE_COMPLETED, {
          course_id: courseId,
          total_lessons: totalLessons,
          completion_path: 'lesson_navigation',
        })
      }

      setLoading(false)

      // Check if a certificate was auto-issued after this lesson completion
      const { data: cert } = await supabase
        .from('certificates')
        .select('certificate_id, verification_code')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle()

      if (cert?.verification_code) {
        setCertificateCode(cert.verification_code)
        toast.success(t('certificateEarnedTitle'), {
          description: t('certificateEarnedDescription'),
          duration: 8000,
          action: {
            label: t('view'),
            onClick: () => router.push(`/verify/${cert.verification_code}`),
          },
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
    <>
    {certificateCode && (
      <div className="shrink-0 border-t border-success/30 bg-success/10 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center justify-center gap-3 max-w-3xl mx-auto">
          <IconCertificate className="h-5 w-5 text-success shrink-0" />
          <span className="text-sm font-semibold text-success">
            {t('certificateBanner')}
          </span>
          <Link href={`/verify/${certificateCode}`}>
            <Button variant="outline" size="sm" className="border-success/30 text-success hover:bg-success/20 font-semibold gap-1.5">
              <IconCertificate className="h-3.5 w-3.5" />
              {t('view')}
            </Button>
          </Link>
        </div>
      </div>
    )}
    <footer className="shrink-0 border-t bg-card/80 backdrop-blur-sm px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-3 md:px-6">
      <div className="flex items-center justify-between gap-2 sm:gap-3 max-w-3xl mx-auto">
        {/* Previous */}
        <div className="flex-1 flex justify-start">
          {prevLessonId ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${prevLessonId}`}>
              <Button variant="ghost" size="sm" title={`${t('previous')} (←)`} className="gap-1.5 text-muted-foreground hover:text-foreground max-sm:h-10 max-sm:min-w-10">
                <IconArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{t('previous')}</span>
              </Button>
            </Link>
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground max-sm:h-10 max-sm:min-w-10">
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
          disabled={loading || checkpointsBlocked}
          title={
            checkpointsBlocked
              ? t('checkpointsRequired', { count: checkpointsCtx?.missingRequired ?? 0 })
              : undefined
          }
          variant={completed ? 'secondary' : 'default'}
          size="sm"
          className={cn(
            'gap-2 px-5 font-semibold transition-all duration-300 max-sm:h-10',
            completed && 'bg-success/10 text-success hover:bg-success/20 border border-success/20'
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
              <Button size="sm" className="gap-1.5 max-sm:h-10 max-sm:min-w-10" disabled title={t('completeFirst')}>
                <span className="hidden sm:inline">{t('next')}</span>
                <IconArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLessonId}`}>
                <Button size="sm" title={`${t('next')} (→)`} className="gap-1.5 max-sm:h-10 max-sm:min-w-10">
                  <span className="hidden sm:inline">{t('next')}</span>
                  <IconArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}>
              <Button size="sm" className="gap-1.5 max-sm:h-10 max-sm:min-w-10">
                <span className="hidden sm:inline">{t('finishCourse')}</span>
                <IconCheck className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </footer>
    <AlertDialog open={uncompleteOpen} onOpenChange={setUncompleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('uncompleteConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('uncompleteConfirmDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t('uncompleteCancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleUncomplete} disabled={loading}>
            {loading ? (
              <>
                <IconLoader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />
                {t('uncompleteConfirming')}
              </>
            ) : (
              t('uncompleteConfirm')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
