'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IconBook, IconCheck } from '@tabler/icons-react'

interface CourseCardProps {
  course: {
    course_id: number
    title: string
    description: string | null
    thumbnail_url: string | null
  }
  progress: {
    completedLessons: number
    totalLessons: number
  }
}

export function CourseCard({ course, progress }: CourseCardProps) {
  const progressPercent =
    progress.totalLessons > 0
      ? Math.round((progress.completedLessons / progress.totalLessons) * 100)
      : 0

  return (
    <Link href={`/dashboard/student/courses/${course.course_id}`}>
      <Card className="h-full overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 group">
        {/* Thumbnail */}
        <div className="aspect-video w-full overflow-hidden bg-muted">
          {course.thumbnail_url ? (
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <IconBook className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </div>

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-lg">{course.title}</CardTitle>
            {progressPercent === 100 && (
              <Badge variant="default" className="shrink-0 bg-green-600">
                <IconCheck className="mr-1 h-3 w-3" />
                Done
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {course.description && (
            <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
              {course.description}
            </p>
          )}

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>
                {progress.completedLessons}/{progress.totalLessons} lessons
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
