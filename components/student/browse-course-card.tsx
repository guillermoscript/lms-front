'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { IconCheck, IconLock, IconTrophy } from '@tabler/icons-react'
import { useEnrollment } from '@/lib/hooks/use-enrollment'

interface BrowseCourseCardProps {
  course: {
    course_id: number
    title: string
    description?: string
    thumbnail_url?: string
    tags?: string | string[]
  }
  isEnrolled: boolean
  hasActiveSubscription: boolean
  subscriptionId?: number
}

export function BrowseCourseCard({
  course,
  isEnrolled,
  hasActiveSubscription,
  subscriptionId
}: BrowseCourseCardProps) {
  const { enrollInCourse, loading } = useEnrollment()
  const t = useTranslations('components.browseCourse')

  const handleEnroll = async () => {
    if (!subscriptionId) return
    await enrollInCourse(course.course_id, subscriptionId)
  }

  // Parse tags
  const tags = course.tags
    ? (Array.isArray(course.tags) ? course.tags : course.tags.split(',')).slice(0, 3)
    : []

  return (
    <Card className="flex flex-col overflow-hidden hover:shadow-lg transition-shadow">
      {/* Thumbnail */}
      <Link href={isEnrolled ? `/dashboard/student/courses/${course.course_id}` : `/courses/${course.course_id}`}>
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {course.thumbnail_url ? (
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <IconTrophy className="w-12 h-12 text-muted-foreground" />
            </div>
          )}

          {/* Enrolled badge */}
          {isEnrolled && (
            <div className="absolute top-3 right-3">
              <Badge className="gap-1 bg-green-500 hover:bg-green-600">
                <IconCheck className="w-3 h-3" />
                {t('enrolled')}
              </Badge>
            </div>
          )}
        </div>
      </Link>

      <CardHeader className="pb-3">
        <Link href={isEnrolled ? `/dashboard/student/courses/${course.course_id}` : `/courses/${course.course_id}`}>
          <h3 className="font-semibold text-lg line-clamp-2 hover:text-primary transition-colors">
            {course.title}
          </h3>
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-3 space-y-3">
        {/* Description */}
        {course.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {course.description}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag.trim()}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 border-t">
        {isEnrolled ? (
          <Link href={`/dashboard/student/courses/${course.course_id}`} className="w-full">
            <Button className="w-full">{t('goCourse')}</Button>
          </Link>
        ) : hasActiveSubscription ? (
          <Button
            className="w-full"
            onClick={handleEnroll}
            disabled={loading}
          >
            {loading ? t('enrolling') : t('enrollNow')}
          </Button>
        ) : (
          <Link href="/pricing" className="w-full">
            <Button variant="outline" className="w-full gap-2">
              <IconLock className="w-4 h-4" />
              {t('subscribeAccess')}
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  )
}
