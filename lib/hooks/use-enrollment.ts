'use client'

/**
 * Enrollment Hook
 *
 * Client-side hook for subscription holders to self-enroll in plan-covered
 * courses. Delegates to the self_enroll_subscription_course RPC, which creates
 * a `subscription` entitlement (SECURITY DEFINER, verifies the subscription
 * covers the course). See docs/ENTITLEMENTS_MIGRATION_PLAN.md.
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { isSalesBlockedError } from '@/lib/billing/sales-block-error'
import { useAnalytics } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

export function useEnrollment() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const analytics = useAnalytics()
  const tFees = useTranslations('platformFees')

  /**
   * Self-enroll the current user in a course covered by their subscription.
   * @param courseId - Course to enroll in
   */
  const enrollInCourse = async (courseId: number) => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: rpcError } = await supabase.rpc('self_enroll_subscription_course', {
        _course_id: courseId,
      })

      if (rpcError) {
        // #929: the school's sales are paused (LM003). Neutral copy — never
        // the school's fee debt (design 4.4).
        if (isSalesBlockedError(rpcError)) throw new Error(tFees('salesBlocked'))
        throw new Error(rpcError.message)
      }

      // The only visibility there is on subscription-driven access. This RPC
      // bypasses checkout, every server action and every API route, so without
      // this event a subscriber who works through ten courses is indistinguishable
      // from one who never logged in. Fires on RPC success only.
      analytics.track(ANALYTICS_EVENTS.COURSE_SELF_ENROLLED, {
        course_id: courseId,
        source: 'subscription',
      })

      toast.success('Successfully enrolled in course!')
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enroll'
      setError(message)
      toast.error(message)
      console.error('Enrollment error:', err)
    } finally {
      setLoading(false)
    }
  }

  return {
    enrollInCourse,
    loading,
    error,
  }
}
