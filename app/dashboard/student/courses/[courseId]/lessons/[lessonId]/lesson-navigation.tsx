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
    <footer className="shrink-0 border-t bg-card px-3 py-3 md:px-6 md:py-4">
      <div className="flex items-center justify-between gap-2 max-w-5xl mx-auto">
        {/* Previous lesson */}
        <div className="flex-1">
          {prevLessonId ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${prevLessonId}`}>
              <Button variant="outline" className="w-full sm:w-auto px-2 sm:px-4">
                <IconArrowLeft className="sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
            </Link>
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}>
              <Button variant="outline" className="w-full sm:w-auto px-2 sm:px-4">
                <IconArrowLeft className="sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Back to Course</span>
              </Button>
            </Link>
          )}
        </div>

        {/* Complete button */}
        <div className="flex-1 flex justify-center">
          <Button
            onClick={handleComplete}
            disabled={loading}
            variant={completed ? 'secondary' : 'default'}
            className={cn(
              "w-full sm:w-auto px-2 sm:px-4",
              completed ? 'bg-green-600 hover:bg-green-700 text-white' : ''
            )}
          >
            {loading ? (
              <IconLoader2 className="sm:mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconCheck className="sm:mr-2 h-4 w-4" />
            )}
            <span className="hidden sm:inline">{completed ? 'Completed' : 'Mark as Complete'}</span>
            <span className="sm:hidden">{completed ? 'Done' : 'Complete'}</span>
          </Button>
        </div>

        {/* Next lesson */}
        <div className="flex-1 flex justify-end">
          {nextLessonId ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLessonId}`}>
              <Button className="w-full sm:w-auto px-2 sm:px-4">
                <span className="hidden sm:inline">Next</span>
                <IconArrowRight className="sm:ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}>
              <Button className="w-full sm:w-auto px-2 sm:px-4">
                <span className="hidden sm:inline">Finish Course</span>
                <IconCheck className="sm:ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </footer>
  )
}
