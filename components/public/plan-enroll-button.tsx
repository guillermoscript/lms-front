'use client'

import { useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface PlanEnrollButtonProps {
  courseId: number
}

/**
 * One-click enroll for subscribers whose plan covers this course.
 * Uses the self_enroll_subscription_course RPC (SECURITY DEFINER — verifies
 * the caller's active subscription actually covers the course).
 */
export function PlanEnrollButton({ courseId }: PlanEnrollButtonProps) {
  const router = useRouter()
  const t = useTranslations('coursePublicDetails.pricing')
  const [isPending, startTransition] = useTransition()

  const enroll = useCallback(() => {
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc('self_enroll_subscription_course', {
        _course_id: courseId,
      })
      if (error) {
        toast.error(error.message || t('enrollmentError'))
        return
      }
      toast.success(t('enrollmentSuccess'))
      router.push(`/dashboard/student/courses/${courseId}`)
    })
  }, [courseId, router, t])

  return (
    <Button
      type="button"
      className="h-11 w-full bg-cyan-500 text-sm font-bold text-black shadow-lg shadow-cyan-500/20 hover:bg-cyan-400"
      onClick={enroll}
      disabled={isPending}
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <IconLoader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('enrolling')}
        </span>
      ) : (
        t('enrollWithPlan')
      )}
    </Button>
  )
}
