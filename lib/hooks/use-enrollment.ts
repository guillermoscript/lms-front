'use client'

/**
 * Enrollment Hook
 * 
 * Client-side hook for handling course enrollment actions.
 * Used by subscription users to enroll in courses on-demand.
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
   * Enroll user in a course using their active subscription
   * Creates an enrollment record with subscription_id
   * 
   * @param courseId - Course to enroll in
   * @param subscriptionId - User's active subscription ID
   */
  const enrollInCourse = async (courseId: number, subscriptionId: number) => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('You must be logged in to enroll')
      }

      // Check if already enrolled
      const { data: existing } = await supabase
        .from('enrollments')
        .select('enrollment_id')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .eq('status', 'active')
        .single()

      if (existing) {
        toast.info('You are already enrolled in this course')
        router.refresh()
        return
      }

      // Create enrollment with subscription_id
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert({
          user_id: user.id,
          course_id: courseId,
          subscription_id: subscriptionId,
          status: 'active',
          enrollment_date: new Date().toISOString(),
        })

      if (enrollError) {
        throw new Error(enrollError.message)
      }

      // Success!
      toast.success('Successfully enrolled in course!')
      
      // Refresh to show updated enrollment
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
