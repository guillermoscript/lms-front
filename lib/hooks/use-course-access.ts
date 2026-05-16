'use client'

/**
 * Course Access Hook
 *
 * Client-side hook to check if the user has access to a specific course.
 * Reads the `entitlements` table — access is granted by any active,
 * non-expired entitlement (product / subscription / free / admin_grant).
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  computeCourseAccess,
  type CourseAccess,
  type EntitlementRow,
} from '@/lib/services/enrollment-service'

const NO_ACCESS: CourseAccess = {
  hasAccess: false,
  accessType: null,
  accessTypes: [],
  isPerpetual: false,
  isExpired: false,
}

export function useCourseAccess(courseId: number) {
  const [access, setAccess] = useState<CourseAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkAccess() {
      try {
        const supabase = createClient()

        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user

        if (!user) {
          setAccess(NO_ACCESS)
          return
        }

        const { data } = await supabase
          .from('entitlements')
          .select('entitlement_id, course_id, source_type, source_id, status, granted_at, expires_at')
          .eq('user_id', user.id)
          .eq('course_id', courseId)

        setAccess(computeCourseAccess((data ?? []) as EntitlementRow[]))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to check access'
        setError(message)
        console.error('Access check error:', err)
        setAccess(NO_ACCESS)
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
