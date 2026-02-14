'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { IconCheck, IconCircle, IconPlayerPlay } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface Lesson {
  id: number
  title: string
  sequence: number
  isCompleted: boolean
}

interface LessonSidebarProps {
  courseId: number
  courseTitle: string
  lessons: Lesson[]
  currentLessonId?: number
}

export function LessonSidebar({
  courseId,
  courseTitle,
  lessons,
  currentLessonId,
}: LessonSidebarProps) {
  const t = useTranslations('components.lessonSidebar')

  return (
    <aside className="h-full w-64 shrink-0 border-r bg-card overflow-y-auto">
      <div className="sticky top-0 bg-card border-b p-4">
        <Link
          href={`/dashboard/student/courses/${courseId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; {t('backToCourse')}
        </Link>
        <h2 className="mt-2 font-semibold line-clamp-2">{courseTitle}</h2>
      </div>

      <nav className="p-2">
        <ul className="space-y-1">
          {lessons.map((lesson) => {
            const isActive = lesson.id === currentLessonId

            return (
              <li key={lesson.id}>
                <Link
                  href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {lesson.isCompleted ? (
                      <IconCheck className="h-4 w-4 text-green-500" />
                    ) : isActive ? (
                      <IconPlayerPlay className="h-4 w-4" />
                    ) : (
                      <IconCircle className="h-3 w-3" />
                    )}
                  </span>
                  <span className="line-clamp-2">
                    {lesson.sequence}. {lesson.title}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
