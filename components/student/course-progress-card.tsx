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
    instructor: string
    completedLessons: number
    totalLessons: number
    progress: number
  }
}

export function CourseProgressCard({ course }: CourseProgressCardProps) {
  const t = useTranslations('components.courseProgress')

  return (
    <Link href={`/dashboard/student/courses/${course.course_id}`}>
      <div className="group bg-card border border-border hover:border-accent rounded-2xl overflow-hidden transition-all hover:shadow-xl hover:shadow-cyan-500/10">
        <div className="flex flex-col sm:flex-row gap-0">
          {/* Thumbnail */}
          <div className="sm:w-48 h-40 sm:h-auto bg-muted overflow-hidden shrink-0">
            {course.thumbnail_url ? (
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <IconBook className="h-12 w-12 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 p-6 flex flex-col justify-between">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground group-hover:text-cyan-400 transition-colors line-clamp-1">
                {course.title}
              </h3>
              <p className="text-sm text-muted-foreground">Instructor: {course.instructor}</p>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('progress')}</span>
                <span className="text-foreground font-semibold">{course.progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
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
