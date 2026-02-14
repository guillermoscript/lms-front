'use client'

/**
 * Course Access Hook
 * 
 * Client-side hook to check if user has access to a specific course.
 * Checks both product-based and subscription-based access.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { determineAccessStatus, type CourseAccess } from '@/lib/services/enrollment-service'

export function useCourseAccess(courseId: number) {
  const [access, setAccess] = useState<CourseAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkAccess() {
      try {
        const supabase = createClient()

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setAccess({
            hasAccess: false,
            accessType: null,
            isExpired: false,
          })
          setLoading(false)
          return
        }

        // Check enrollment with subscription info
        const { data: enrollment, error: enrollError } = await supabase
          .from('enrollments')
          .select(`
            *,
            subscription:subscriptions!enrollments_subscription_id_fkey (
              subscription_id,
              subscription_status,
              end_date
            ),
            product:products!enrollments_product_id_fkey (
              product_id,
              name
            )
          `)
          .eq('user_id', user.id)
          .eq('course_id', courseId)
          .eq('status', 'active')
          .single()

        if (enrollError || !enrollment) {
          setAccess({
            hasAccess: false,
            accessType: null,
            isExpired: false,
          })
          setLoading(false)
          return
        }

        // Determine access status using service function
        const accessStatus = determineAccessStatus(enrollment)
        setAccess(accessStatus)

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to check access'
        setError(message)
        console.error('Access check error:', err)
      } finally {
        setLoading(false)
      }
    }

    if (courseId) {
      checkAccess()
    }
  }, [courseId])

  return { access, loading, error }
}
