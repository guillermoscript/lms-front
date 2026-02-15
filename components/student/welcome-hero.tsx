"use client"

import { Button } from "@/components/ui/button"
import { IconArrowRight } from "@tabler/icons-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

interface WelcomeHeroProps {
  userName: string
  coursesInProgress: number
  lessonsCompleted: number
}

export function WelcomeHero({ userName, coursesInProgress, lessonsCompleted }: WelcomeHeroProps) {
  const t = useTranslations('welcomeHero')

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-6 md:p-8 text-primary-foreground">
      {/* Subtle decorative pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg
          className="absolute right-0 top-0 h-full w-1/2"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="300" cy="100" r="200" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <circle cx="350" cy="200" r="150" stroke="currentColor" strokeWidth="1" opacity="0.2" />
          <circle cx="250" cy="300" r="100" stroke="currentColor" strokeWidth="1" opacity="0.1" />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-balance">
            {t('welcomeBack', { userName })}
          </h1>
          <p className="text-primary-foreground/70 max-w-lg">
            {coursesInProgress > 0
              ? `You have ${coursesInProgress} course${coursesInProgress === 1 ? '' : 's'} in progress and ${lessonsCompleted} lesson${lessonsCompleted === 1 ? '' : 's'} completed. Keep it up!`
              : 'Start your learning journey by enrolling in a course.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <Link href="/dashboard/student/browse">
            <Button variant="secondary" className="font-bold gap-2 h-10 px-5">
              Browse Courses
              <IconArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
