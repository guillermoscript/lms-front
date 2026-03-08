'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { IconCheck, IconPlayerPlay, IconArrowLeft } from '@tabler/icons-react'
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
  const completedCount = lessons.filter(l => l.isCompleted).length
  const progress = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0

  return (
    <aside className="h-full w-72 shrink-0 border-l bg-card/50 overflow-y-auto flex flex-col">
      {/* Course header */}
      <div className="sticky top-0 bg-card/80 backdrop-blur-sm border-b p-4 z-10">
        <Link
          href={`/dashboard/student/courses/${courseId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <IconArrowLeft className="h-3 w-3" />
          {t('backToCourse')}
        </Link>
        <h2 className="font-semibold text-sm leading-snug line-clamp-2">{courseTitle}</h2>

        {/* Progress bar */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="font-medium">{completedCount}/{lessons.length}</span>
            <span className="font-bold tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Lesson list */}
      <nav className="flex-1 p-2" aria-label={t('lessonList')}>
        <ul className="space-y-0.5">
          {lessons.map((lesson) => {
            const isActive = lesson.id === currentLessonId

            return (
              <li key={lesson.id}>
                <Link
                  href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-all group',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  {/* Status indicator */}
                  <span className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5 transition-all',
                    lesson.isCompleted
                      ? 'bg-emerald-500 text-white'
                      : isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                  )}>
                    {lesson.isCompleted ? (
                      <IconCheck className="h-3.5 w-3.5" />
                    ) : isActive ? (
                      <IconPlayerPlay className="h-3 w-3" />
                    ) : (
                      <span>{lesson.sequence}</span>
                    )}
                  </span>

                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      'line-clamp-2 leading-snug text-[13px]',
                      isActive ? 'font-semibold' : 'font-medium',
                      lesson.isCompleted && !isActive && 'line-through opacity-60'
                    )}>
                      {lesson.title}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
