"use client"

import { IconBook, IconCircleCheck, IconClock } from "@tabler/icons-react"
import { useTranslations } from "next-intl"

interface StatsCardsProps {
  totalLessonsCompleted: number
  coursesInProgress: number
  coursesCompleted: number
}

export function StatsCards({ totalLessonsCompleted, coursesInProgress, coursesCompleted }: StatsCardsProps) {
  const t = useTranslations('statsCards')

  const stats = [
    {
      label: t('lessonsCompleted'),
      value: totalLessonsCompleted,
      icon: IconBook,
    },
    {
      label: t('inProgress'),
      value: coursesInProgress,
      icon: IconClock,
    },
    {
      label: t('coursesCompleted'),
      value: coursesCompleted,
      icon: IconCircleCheck,
    },
  ]

  return (
    <div className="flex items-center gap-6 text-sm">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-2 text-muted-foreground">
          <stat.icon size={16} className="shrink-0" />
          <span className="font-bold tabular-nums text-foreground">{stat.value}</span>
          <span className="hidden sm:inline">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}
