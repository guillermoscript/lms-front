"use client"

import { Button } from "@/components/ui/button"
import { IconArrowRight, IconPlayerPlay } from "@tabler/icons-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

interface WelcomeHeroProps {
  userName: string
  coursesInProgress: number
  lessonsCompleted: number
  nextCourse?: {
    course_id: number
    title: string
  } | null
}

export function WelcomeHero({ userName, coursesInProgress, lessonsCompleted, nextCourse }: WelcomeHeroProps) {
  const t = useTranslations('welcomeHero')

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-2"
      data-testid="welcome-hero"
    >
      <div className="space-y-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight truncate">
          {t('welcomeBack', { userName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {coursesInProgress > 0
            ? t('progressSummary', { courses: coursesInProgress, lessons: lessonsCompleted })
            : t('getStarted')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 shrink-0">
        {nextCourse ? (
          <Link href={`/dashboard/student/courses/${nextCourse.course_id}`}>
            <Button className="gap-2 h-9 px-4 font-semibold">
              <IconPlayerPlay size={15} />
              {t('continueLearning')}
            </Button>
          </Link>
        ) : (
          <Link href="/dashboard/student/browse">
            <Button variant="outline" className="gap-2 h-9 px-4 font-semibold">
              {t('browseCourses')}
              <IconArrowRight size={15} />
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
