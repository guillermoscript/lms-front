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
import { toast } from 'sonner'

export function useEnrollment() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

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
        throw new Error(rpcError.message)
      }

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
