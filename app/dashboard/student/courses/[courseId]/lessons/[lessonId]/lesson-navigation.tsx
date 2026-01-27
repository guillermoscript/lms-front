'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react'

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
      // Uncomplete
      await supabase
        .from('lesson_completions')
        .delete()
        .eq('lesson_id', lessonId)
        .eq('user_id', user.id)

      setCompleted(false)
    } else {
      // Complete
      await supabase.from('lesson_completions').insert({
        lesson_id: lessonId,
        user_id: user.id,
      })

      setCompleted(true)

      // If there's a next lesson, navigate to it after a short delay
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
    <footer className="shrink-0 border-t bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Previous lesson */}
        <div>
          {prevLessonId ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${prevLessonId}`}>
              <Button variant="outline">
                <IconArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
            </Link>
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}>
              <Button variant="outline">
                <IconArrowLeft className="mr-2 h-4 w-4" />
                Back to Course
              </Button>
            </Link>
          )}
        </div>

        {/* Complete button */}
        <Button
          onClick={handleComplete}
          disabled={loading}
          variant={completed ? 'secondary' : 'default'}
          className={completed ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
        >
          {loading ? (
            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <IconCheck className="mr-2 h-4 w-4" />
          )}
          {completed ? 'Completed' : 'Mark as Complete'}
        </Button>

        {/* Next lesson */}
        <div>
          {nextLessonId ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLessonId}`}>
              <Button>
                Next
                <IconArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}>
              <Button>
                Finish Course
                <IconCheck className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </footer>
  )
}
