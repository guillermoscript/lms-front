"use client"

import * as motion from "motion/react-client"
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
      label: t('hoursStudied'),
      value: totalLessonsCompleted,
      suffix: ' lessons',
      icon: IconBook,
      color: "text-blue-500 bg-blue-500/10",
    },
    {
      label: 'In Progress',
      value: coursesInProgress,
      suffix: coursesInProgress === 1 ? ' course' : ' courses',
      icon: IconClock,
      color: "text-amber-500 bg-amber-500/10",
    },
    {
      label: t('coursesCompleted'),
      value: coursesCompleted,
      suffix: coursesCompleted === 1 ? ' course' : ' courses',
      icon: IconCircleCheck,
      color: "text-emerald-500 bg-emerald-500/10",
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat, idx) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, duration: 0.25 }}
          className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4"
        >
          <div className={`p-2.5 rounded-xl ${stat.color}`}>
            <stat.icon size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground truncate">{stat.label}</p>
            <p className="text-2xl font-black tabular-nums leading-tight">
              {stat.value}
              <span className="text-sm font-medium text-muted-foreground">{stat.suffix}</span>
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
