"use client"

import Link from "next/link"
import { IconBook } from "@tabler/icons-react"
import { useTranslations } from "next-intl"

interface CourseProgressCardProps {
  course: {
    course_id: number
    title: string
    description: string | null
    thumbnail_url: string | null
    completedLessons: number
    totalLessons: number
    progress: number
  }
}

export function CourseProgressCard({ course }: CourseProgressCardProps) {
  const t = useTranslations('components.courseProgress')

  return (
    <Link href={`/dashboard/student/courses/${course.course_id}`}>
      <div className="group bg-card border border-border hover:border-primary/30 active:border-primary/30 rounded-2xl overflow-hidden transition-all hover:shadow-lg active:shadow-lg">
        <div className="flex flex-col sm:flex-row">
          {/* Thumbnail */}
          <div className="sm:w-48 h-32 sm:h-auto bg-muted overflow-hidden shrink-0">
            {course.thumbnail_url ? (
              <img
                src={course.thumbnail_url}
                alt={course.title}
                width={192}
                height={144}
                loading="lazy"
                className="w-full h-full object-cover motion-safe:group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <IconBook className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-between">
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {course.title}
              </h3>
              {course.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">{course.description}</p>
              )}
            </div>

            <div className="mt-3 sm:mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {course.completedLessons}/{course.totalLessons} {t('lessons')}
                </span>
                <span className="text-foreground font-bold tabular-nums">{course.progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${course.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
